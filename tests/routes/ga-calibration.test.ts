/**
 * tests/routes/ga-calibration.test.ts — D551 GA 校准后端（端点族 + 回流 + 版本链 + stats + 迁移）
 *
 * 契约优先（铁律 47+48）：spec §8.2 契约表 → 测试 → 实现。
 * 覆盖（DS2/DS3/DS4/DS6）:
 *   - 认证三态: 401 无 auth / 400 缺 orgId（D338 fail-closed）/ 403 非 ga-admin（用例①）
 *   - 四动作正常提交 → 201 + AgentMemoryStore 条目 type='ga_calibration' + 回流双写（用例②）
 *   - 校验边界: mark_error 缺 errorType / supersedes 跨 target → CHAIN_ERROR / 信号枚举外 / severity 越界（用例③）
 *   - 版本链: supersedes 两次校准 → 默认列表仅 latest + includeChain=1 全链升序（用例④）
 *   - 降级: store 抛错 → 500 + degraded:true + log.error（用例⑤，铁律 24/31）
 *   - 回流集成: feedback_log 行（target_type='diagnosis_conclusion', actor_role='ga'）+ getAggregatedSignals(1) 聚合可见（用例⑥）
 *   - migration: 旧 schema 表 → 'd551_target_type' 重建表迁移 → 新值可写 + 旧数据保留（用例⑦）
 *   - stats: 四类计数 + byType 10 枚举 + reflux 聚合 + note 诚实降级声明（用例⑪）
 *
 * 惯例: 用例内动态 import 路由模块（对齐 tests/routes/ga-annotations.test.ts L15）+
 * vi.mock engine-context 注入内存 SQLite（对齐 tests/routes/admin-knowledge.test.ts L24-27 先例）。
 * 集成真实路由处理器（不 mock 管线，铁律 12）。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Database from 'better-sqlite3';
import type { Router, Request, Response } from 'express';
import { getFeedbackCollector, FeedbackCollector } from '../../src/growth/feedback-collector';

// ═══ hoisted 状态（vi.mock 工厂闭包引用） ═══

const state = vi.hoisted(() => ({
  db: null as Database | null,
  throwStore: false,
}));

const logs = vi.hoisted(() => ({
  errors: [] as unknown[][],
  warns: [] as unknown[][],
}));

// engine-context 注入内存库；throwStore 置真 → 模拟 store 故障（用例⑤ 降级路径）
vi.mock('../../src/init/engine-context', () => ({
  getDatabase: () => {
    if (state.throwStore) throw new Error('engine db 注入故障（测试）');
    if (!state.db) throw new Error('测试 db 未就绪');
    return state.db;
  },
}));

// logger 探针: 捕获 log.error/warn 调用（用例⑤ 断言 log.error 非空吞，铁律 24）
vi.mock('@synova/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@synova/logger')>();
  return {
    ...actual,
    createLogger: () => ({
      info: () => {},
      debug: () => {},
      warn: (...args: unknown[]) => { logs.warns.push(args); },
      error: (...args: unknown[]) => { logs.errors.push(args); },
    }),
  };
});

// ═══ 路由调用工具（零 as any，铁律 38） ═══

/** express Router stack 最小类型（对齐 admin-knowledge.test.ts 先例） */
interface RouteLayer {
  route?: {
    path?: string;
    methods?: Record<string, boolean>;
    stack: Array<{ handle: (req: Request, res: Response, next: () => void) => unknown }>;
  };
}

function getHandler(router: Router, method: 'get' | 'post', path: string): RouteLayer['route'] extends { stack: Array<{ handle: infer H }> } ? H : never {
  const stack = (router as unknown as { stack: RouteLayer[] }).stack;
  for (const layer of stack) {
    if (layer.route?.path === path && layer.route.methods?.[method]) {
      // route.stack[0].handle = 业务 handler（layer.handle 是 express 内部 dispatch，需 req.method/url）
      return layer.route.stack[0].handle;
    }
  }
  throw new Error(`route 未注册: ${method.toUpperCase()} ${path}`);
}

interface GaAuth {
  sub: string;
  role: string;
  orgId: string;
}

function makeReq(opts: {
  auth?: GaAuth | null;
  body?: Record<string, unknown>;
  query?: Record<string, string>;
}): Request {
  const req: Record<string, unknown> = {
    body: opts.body ?? {},
    query: opts.query ?? {},
    headers: {},
  };
  if (opts.auth !== undefined) req.auth = opts.auth;
  return req as unknown as Request;
}

function makeRes(): { res: Response; status: () => number; body: () => Record<string, unknown> } {
  const captured: { code: number; json: Record<string, unknown> | undefined } = { code: 200, json: undefined };
  const res = {
    status(code: number): Response { captured.code = code; return res as unknown as Response; },
    json(b: unknown): Response { captured.json = b as Record<string, unknown>; return res as unknown as Response; },
  } as unknown as Response;
  return {
    res,
    status: () => captured.code,
    body: () => captured.json ?? {},
  };
}

async function callRoute(
  method: 'get' | 'post',
  path: string,
  opts: { auth?: GaAuth | null; body?: Record<string, unknown>; query?: Record<string, string> },
): Promise<{ status: number; body: Record<string, unknown> }> {
  const mod = await import('../../src/routes/ga-calibration');
  const handler = getHandler(mod.default, method, path);
  const { res, status, body } = makeRes();
  await handler(makeReq(opts), res, () => {});
  return { status: status(), body: body() };
}

const GA_AUTH: GaAuth = { sub: 'ga-user-1', role: 'ga', orgId: 'org-d551' };

function feedbackRows(where: string): Array<Record<string, unknown>> {
  const db = state.db as Database;
  return db.prepare(`SELECT * FROM feedback_log WHERE ${where}`).all() as Array<Record<string, unknown>>;
}

// agent-memory-store 延迟到 mock 生效后动态加载（对齐路由 getStore 的惰性模式）
async function memoryEntriesByTag(tag: string): Promise<Array<{ id: string; value: string; type: string }>> {
  const { getAgentMemoryStore: getStore } = await import('../../src/l4/agent-memory-store');
  const store = getStore(state.db as Database);
  const entries = store.list({ orgId: GA_AUTH.orgId, tags: [tag], limit: 200 });
  return entries.map((e) => ({ id: e.id, value: e.value, type: e.type as string }));
}

// ═══ Setup ═══

let db: Database;

beforeAll(() => {
  db = new Database(':memory:');
  state.db = db;
  // 回流单例指向同一内存库 → POST 后 feedback_log 行可直接 SQL 断言（DS4 用例⑥）
  getFeedbackCollector().setDatabase(db);
});

afterAll(() => {
  db.close();
  state.db = null;
});

// ═══ DS2: POST /api/ga/calibration — 认证三态 + 四动作 + 校验 + 降级 ═══

describe('POST /api/ga/calibration — 认证三态（DS2 用例①）', () => {
  it('无 auth → 401 UNAUTHORIZED（red: 缺 requireGa 时此断言红）', async () => {
    const out = await callRoute('post', '/api/ga/calibration', {
      auth: null,
      body: { targetType: 'diagnosis_conclusion', targetId: 'diag-a1', action: 'mark_error', errorType: '事实错误', correctedContent: '修正' },
    });
    expect(out.status).toBe(401);
    expect(out.body.code).toBe('UNAUTHORIZED');
    expect(out.body.ok).toBe(false);
  });

  it('auth 缺 orgId → 400 ORG_REQUIRED（D338 中国墙 fail-closed）', async () => {
    const out = await callRoute('post', '/api/ga/calibration', {
      auth: { sub: 'ga-user-1', role: 'ga', orgId: '' },
      body: { targetType: 'diagnosis_conclusion', targetId: 'diag-a1', action: 'mark_error', errorType: '事实错误', correctedContent: '修正' },
    });
    expect(out.status).toBe(400);
    expect(out.body.code).toBe('ORG_REQUIRED');
  });

  it('非 ga/admin 角色 → 403 FORBIDDEN', async () => {
    const out = await callRoute('post', '/api/ga/calibration', {
      auth: { sub: 'staff-1', role: 'staff', orgId: 'org-d551' },
      body: { targetType: 'diagnosis_conclusion', targetId: 'diag-a1', action: 'mark_error', errorType: '事实错误', correctedContent: '修正' },
    });
    expect(out.status).toBe(403);
    expect(out.body.code).toBe('FORBIDDEN');
  });
});

describe('POST /api/ga/calibration — 四动作正常提交（DS2 用例② + DS4 用例⑥ 回流双写）', () => {
  it('mark_error → 201 + calibrationId + memory 条目 type=ga_calibration + feedback_log 行 decision=reject', async () => {
    const out = await callRoute('post', '/api/ga/calibration', {
      auth: GA_AUTH,
      body: {
        targetType: 'diagnosis_conclusion', targetId: 'diag-m1', action: 'mark_error',
        errorType: '事实错误', correctedContent: '毛利率口径应为扣非毛利率',
      },
    });
    expect(out.status).toBe(201);
    expect(out.body.ok).toBe(true);
    const calibrationId = out.body.calibrationId as string;
    expect(typeof calibrationId).toBe('string');
    expect(calibrationId.length).toBeGreaterThan(0);

    // memory 条目（DS3: type='ga_calibration'）
    const entries = await memoryEntriesByTag('ga_calibration');
    const mine = entries.find((e) => e.id === calibrationId);
    expect(mine).toBeDefined();
    expect(mine!.type).toBe('ga_calibration');
    const val = JSON.parse(mine!.value) as Record<string, unknown>;
    expect(val.action).toBe('mark_error');
    expect(val.targetId).toBe('diag-m1');
    expect(val.gaId).toBe('ga-user-1');

    // 回流双写（DS4 用例⑥）: feedback_log 行 + evidence_refs 互链
    const rows = feedbackRows("target_type='diagnosis_conclusion' AND actor_role='ga' AND decision='reject'");
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const refs = JSON.parse(String(rows[0].evidence_refs)) as string[];
    expect(refs).toContain(calibrationId);
    expect(rows[0].target_id).toBe('diag-m1');
  });

  it('add_context → 201，不写 feedback_log（背景卡是上下文增强，非纠错信号 — spec §7.1）', async () => {
    const before = feedbackRows("actor_role='ga'").length;
    const out = await callRoute('post', '/api/ga/calibration', {
      auth: GA_AUTH,
      body: { targetType: 'diagnosis_conclusion', targetId: 'diag-c1', action: 'add_context', contextCard: '该客户 Q3 完成组织架构调整' },
    });
    expect(out.status).toBe(201);
    expect(feedbackRows("actor_role='ga'").length).toBe(before);
  });

  it('rewrite_logic → 201 + feedback_log 行 decision=modify', async () => {
    const out = await callRoute('post', '/api/ga/calibration', {
      auth: GA_AUTH,
      body: {
        targetType: 'diagnosis_logic', targetId: 'logic-1', action: 'rewrite_logic',
        originalVersion: '原诊断逻辑', rewrittenVersion: 'GA 重写逻辑',
      },
    });
    expect(out.status).toBe(201);
    const rows = feedbackRows("decision='modify' AND actor_role='ga'");
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it('demote_signal → 201 + feedback_log 行 decision=ineffective', async () => {
    const out = await callRoute('post', '/api/ga/calibration', {
      auth: GA_AUTH,
      body: { targetType: 'signal_relevance', targetId: 'finding-9', action: 'demote_signal', sentinelId: 'sentinel-margin-health' },
    });
    expect(out.status).toBe(201);
    const rows = feedbackRows("decision='ineffective' AND actor_role='ga'");
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});

describe('POST /api/ga/calibration — 校验与版本链边界（DS2 用例③ + DS3）', () => {
  it('mark_error 缺 errorType → 400 VALIDATION_ERROR', async () => {
    const out = await callRoute('post', '/api/ga/calibration', {
      auth: GA_AUTH,
      body: { targetType: 'diagnosis_conclusion', targetId: 'diag-v1', action: 'mark_error', correctedContent: '只有修正内容' },
    });
    expect(out.status).toBe(400);
    expect(out.body.code).toBe('VALIDATION_ERROR');
  });

  it('mark_error errorType 枚举外 → 400', async () => {
    const out = await callRoute('post', '/api/ga/calibration', {
      auth: GA_AUTH,
      body: { targetType: 'diagnosis_conclusion', targetId: 'diag-v1', action: 'mark_error', errorType: '风格问题', correctedContent: 'x' },
    });
    expect(out.status).toBe(400);
  });

  it('rewrite_logic 缺 rewrittenVersion → 400', async () => {
    const out = await callRoute('post', '/api/ga/calibration', {
      auth: GA_AUTH,
      body: { targetType: 'diagnosis_logic', targetId: 'logic-v1', action: 'rewrite_logic', originalVersion: '原版' },
    });
    expect(out.status).toBe(400);
  });

  it('demote_signal 缺 sentinelId → 400', async () => {
    const out = await callRoute('post', '/api/ga/calibration', {
      auth: GA_AUTH,
      body: { targetType: 'signal_relevance', targetId: 'finding-v1', action: 'demote_signal' },
    });
    expect(out.status).toBe(400);
  });

  it('supersedes 指向不存在条目 → 400 CHAIN_ERROR', async () => {
    const out = await callRoute('post', '/api/ga/calibration', {
      auth: GA_AUTH,
      body: {
        targetType: 'diagnosis_conclusion', targetId: 'diag-v2', action: 'rewrite_logic',
        originalVersion: 'a', rewrittenVersion: 'b', supersedes: 'mem_not_exist',
      },
    });
    expect(out.status).toBe(400);
    expect(out.body.code).toBe('CHAIN_ERROR');
  });

  it('supersedes 跨 target → 400 CHAIN_ERROR（须指向同 targetType+targetId 条目）', async () => {
    const first = await callRoute('post', '/api/ga/calibration', {
      auth: GA_AUTH,
      body: { targetType: 'diagnosis_conclusion', targetId: 'diag-chain-x', action: 'mark_error', errorType: '归因错误', correctedContent: 'x' },
    });
    expect(first.status).toBe(201);
    const cross = await callRoute('post', '/api/ga/calibration', {
      auth: GA_AUTH,
      body: {
        targetType: 'diagnosis_conclusion', targetId: 'diag-chain-y', action: 'rewrite_logic',
        originalVersion: 'a', rewrittenVersion: 'b', supersedes: first.body.calibrationId,
      },
    });
    expect(cross.status).toBe(400);
    expect(cross.body.code).toBe('CHAIN_ERROR');
  });
});

describe('POST /api/ga/calibration — 降级诚实（DS2 用例⑤，铁律 24/31）', () => {
  it('store 抛错 → 500 + degraded:true + log.error（非空吞）', async () => {
    state.throwStore = true;
    try {
      const out = await callRoute('post', '/api/ga/calibration', {
        auth: GA_AUTH,
        body: { targetType: 'diagnosis_conclusion', targetId: 'diag-d1', action: 'mark_error', errorType: '事实错误', correctedContent: 'x' },
      });
      expect(out.status).toBe(500);
      expect(out.body.degraded).toBe(true);
      expect(out.body.ok).toBe(false);
      expect(logs.errors.length).toBeGreaterThanOrEqual(1);
    } finally {
      state.throwStore = false;
    }
  });
});

// ═══ DS3: GET /api/ga/calibration — 列表筛选 + 版本链 ═══

describe('GET /api/ga/calibration — 列表筛选 + 分页（DS2/DS3）', () => {
  it('targetType/action 筛选生效 + limit/offset 分页', async () => {
    await callRoute('post', '/api/ga/calibration', {
      auth: GA_AUTH,
      body: { targetType: 'signal_relevance', targetId: 'finding-l1', action: 'demote_signal', sentinelId: 's-l1' },
    });
    const byAction = await callRoute('get', '/api/ga/calibration', {
      auth: GA_AUTH, query: { action: 'demote_signal' },
    });
    expect(byAction.status).toBe(200);
    expect(byAction.body.ok).toBe(true);
    const rows = byAction.body.calibrations as Array<Record<string, unknown>>;
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.every((r) => r.action === 'demote_signal')).toBe(true);

    const paged = await callRoute('get', '/api/ga/calibration', {
      auth: GA_AUTH, query: { limit: '1', offset: '0' },
    });
    expect((paged.body.calibrations as unknown[]).length).toBe(1);
    expect(typeof paged.body.total).toBe('number');
  });
});

describe('GET /api/ga/calibration — supersedes 版本链（DS3 用例④）', () => {
  it('两次校准同 target（第二条 supersedes 第一条）→ 默认列表仅 latest + supersededBy 反向索引正确', async () => {
    const first = await callRoute('post', '/api/ga/calibration', {
      auth: GA_AUTH,
      body: { targetType: 'diagnosis_conclusion', targetId: 'diag-chain-1', action: 'mark_error', errorType: '事实错误', correctedContent: '首版修正' },
    });
    expect(first.status).toBe(201);
    const idA = first.body.calibrationId as string;
    await new Promise((r) => setTimeout(r, 6)); // 保证 calibratedAt 严格递增（升序断言的物理前提）

    const second = await callRoute('post', '/api/ga/calibration', {
      auth: GA_AUTH,
      body: {
        targetType: 'diagnosis_conclusion', targetId: 'diag-chain-1', action: 'rewrite_logic',
        originalVersion: '原版逻辑', rewrittenVersion: '重写逻辑', supersedes: idA,
      },
    });
    expect(second.status).toBe(201);
    const idB = second.body.calibrationId as string;
    expect(second.body.supersedes).toBe(idA);

    // 默认列表: 被取代的首版不出现，仅 latest 链头
    const latest = await callRoute('get', '/api/ga/calibration', {
      auth: GA_AUTH, query: { targetType: 'diagnosis_conclusion', targetId: 'diag-chain-1' },
    });
    const rows = latest.body.calibrations as Array<Record<string, unknown>>;
    expect(latest.body.total).toBe(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].calibrationId).toBe(idB);

    // includeChain=1: 全链 2 条按 calibratedAt 升序 + 首版带 supersededBy 反向索引
    const chain = await callRoute('get', '/api/ga/calibration', {
      auth: GA_AUTH, query: { targetType: 'diagnosis_conclusion', targetId: 'diag-chain-1', includeChain: '1' },
    });
    const chainRows = chain.body.calibrations as Array<Record<string, unknown>>;
    expect(chainRows).toHaveLength(2);
    expect(chainRows[0].calibrationId).toBe(idA);
    expect(chainRows[1].calibrationId).toBe(idB);
    expect(String(chainRows[0].calibratedAt) <= String(chainRows[1].calibratedAt)).toBe(true);
    expect(chainRows[0].supersededBy).toBe(idB);
    expect(chainRows[1].supersededBy).toBeUndefined();
  });
});

// ═══ DS2/DS5 路由层校验: POST /api/ga/calibration/signals ═══

describe('POST /api/ga/calibration/signals — 五要素校验（DS2 用例③；注入链在 ga-manual-injection.test.ts）', () => {
  const validSignal = {
    signalType: '人员变动', title: 'CTO 离职', description: '关键人变动', severity: 8, confidence: 90,
  };

  it('signalType 枚举外 → 400 VALIDATION_ERROR', async () => {
    const out = await callRoute('post', '/api/ga/calibration/signals', {
      auth: GA_AUTH, body: { ...validSignal, signalType: '外星信号' },
    });
    expect(out.status).toBe(400);
    expect(out.body.code).toBe('VALIDATION_ERROR');
  });

  it('severity=11 越界 → 400', async () => {
    const out = await callRoute('post', '/api/ga/calibration/signals', {
      auth: GA_AUTH, body: { ...validSignal, severity: 11 },
    });
    expect(out.status).toBe(400);
  });

  it('confidence=101 越界 → 400', async () => {
    const out = await callRoute('post', '/api/ga/calibration/signals', {
      auth: GA_AUTH, body: { ...validSignal, confidence: 101 },
    });
    expect(out.status).toBe(400);
  });

  it('severity 非数值类型 → 400', async () => {
    const out = await callRoute('post', '/api/ga/calibration/signals', {
      auth: GA_AUTH, body: { ...validSignal, severity: '8' },
    });
    expect(out.status).toBe(400);
  });

  it('缺 title → 400', async () => {
    const out = await callRoute('post', '/api/ga/calibration/signals', {
      auth: GA_AUTH, body: { ...validSignal, title: '' },
    });
    expect(out.status).toBe(400);
  });
});

// ═══ DS6: GET /api/ga/calibration/stats — 效用仪表（用例⑪） ═══

describe('GET /api/ga/calibration/stats — 效用仪表（DS6 用例⑪）', () => {
  it('四类计数 + byType 10 枚举 + reflux 聚合 + note 诚实降级声明', async () => {
    const out = await callRoute('get', '/api/ga/calibration/stats', { auth: GA_AUTH });
    expect(out.status).toBe(200);
    expect(out.body.ok).toBe(true);

    const calibration = out.body.calibration as { total: number; byAction: Record<string, number> };
    expect(calibration.byAction.mark_error).toBeGreaterThanOrEqual(1);
    expect(calibration.byAction.add_context).toBeGreaterThanOrEqual(1);
    expect(calibration.byAction.rewrite_logic).toBeGreaterThanOrEqual(1);
    expect(calibration.byAction.demote_signal).toBeGreaterThanOrEqual(1);
    expect(calibration.total).toBeGreaterThanOrEqual(4);

    const injection = out.body.injection as { total: number; byType: Record<string, number> };
    const ENUM = ['人员变动', '战略转向', '竞品动态', '客户反馈', '监管变化', '供应商变化', '市场传闻', '技术突破', '内部冲突', '其他'];
    expect(Object.keys(injection.byType).sort()).toEqual([...ENUM].sort());

    const reflux = out.body.reflux as { feedbackCount: number; byDecision: Record<string, number> };
    expect(reflux.feedbackCount).toBeGreaterThanOrEqual(3);
    expect(reflux.byDecision.reject).toBeGreaterThanOrEqual(1);
    expect(reflux.byDecision.modify).toBeGreaterThanOrEqual(1);
    expect(reflux.byDecision.ineffective).toBeGreaterThanOrEqual(1);

    // 诚实降级（spec §3.3 排除采纳率 — note 必须显式声明）
    expect(typeof out.body.note).toBe('string');
    expect(String(out.body.note)).toContain('采纳率');
  });
});

// ═══ DS4 收口: 聚合可见 + migration（用例⑥⑦） ═══

describe('DS4 收口 — getAggregatedSignals 聚合可见（用例⑥）', () => {
  it('回流后聚合池含 diagnosis_conclusion 组（GROUP BY 无白名单自动进池）', () => {
    const signals = getFeedbackCollector().getAggregatedSignals(1);
    const hit = signals.find((s) => s.targetType === 'diagnosis_conclusion' && s.decision === 'reject');
    expect(hit).toBeDefined();
    expect(hit!.count).toBeGreaterThanOrEqual(1);
    expect(hit!.actorRoles).toContain('ga');
  });
});

describe('DS4 用例⑦ — d551_target_type 迁移（SQLite 无法 ALTER CHECK → 重建表）', () => {
  it('旧 schema 表 → setDatabase 迁移后 INSERT 新值成功 + 旧数据保留 + schema_version 含标记', () => {
    const oldDb = new Database(':memory:');
    try {
      // 预置旧 schema（枚举外新值被旧 CHECK 拒绝的形态）
      oldDb.exec(`
        CREATE TABLE feedback_log (
          id            TEXT PRIMARY KEY,
          enterprise_id TEXT NOT NULL,
          actor_id      TEXT NOT NULL,
          decision      TEXT NOT NULL CHECK(decision IN ('reject','modify','reject_path','ineffective')),
          target_type   TEXT NOT NULL CHECK(target_type IN ('sentinel_alert','goal','proposal')),
          target_id     TEXT NOT NULL,
          reason        TEXT DEFAULT '',
          evidence_refs TEXT DEFAULT '[]',
          actor_role    TEXT DEFAULT '',
          created_at    TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
      oldDb.prepare(`INSERT INTO feedback_log (id, enterprise_id, actor_id, decision, target_type, target_id, actor_role)
        VALUES ('legacy-1', 'org-d551', 'mid-1', 'reject', 'sentinel_alert', 's-1', 'middle')`).run();

      const collector = new FeedbackCollector();
      collector.setDatabase(oldDb);

      // 迁移生效物理证据 1: schema_version 含 'd551_target_type'
      const versions = oldDb.prepare(`SELECT version FROM schema_version`).all() as Array<{ version: string }>;
      expect(versions.map((v) => v.version)).toContain('d551_target_type');

      // 迁移生效物理证据 2: 新枚举值 INSERT 成功（旧 CHECK 下会抛错）
      const rec = collector.collectFeedback({
        enterpriseId: 'org-d551', actorId: 'ga-user-1', decision: 'reject',
        targetType: 'diagnosis_conclusion', targetId: 'diag-mig-1', actorRole: 'ga',
      });
      expect(rec.degraded).toBeUndefined();

      // 迁移生效物理证据 3: 旧数据保留（重建表复制）
      const legacy = oldDb.prepare(`SELECT * FROM feedback_log WHERE id='legacy-1'`).get() as Record<string, unknown> | undefined;
      expect(legacy).toBeDefined();
      expect(legacy!.target_type).toBe('sentinel_alert');
    } finally {
      oldDb.close();
    }
  });

  it('新库直接建表 → 已含新枚举，迁移只补 schema_version 标记不重建', () => {
    const fresh = new Database(':memory:');
    try {
      const collector = new FeedbackCollector();
      collector.setDatabase(fresh);
      const rec = collector.collectFeedback({
        enterpriseId: 'org-d551', actorId: 'ga-user-1', decision: 'modify',
        targetType: 'diagnosis_conclusion', targetId: 'diag-fresh-1', actorRole: 'ga',
      });
      expect(rec.degraded).toBeUndefined();
      const versions = fresh.prepare(`SELECT version FROM schema_version`).all() as Array<{ version: string }>;
      expect(versions.map((v) => v.version)).toContain('d551_target_type');
      expect(versions.map((v) => v.version)).toContain('d93b_actor_role');
    } finally {
      fresh.close();
    }
  });

  it('agent_memory 旧库（旧 type CHECK + FTS）→ 迁移后 ga_calibration/manual_signal 可写 + 存量数据零丢失', async () => {
    const oldDb = new Database(':memory:');
    try {
      // 预置真实旧态: 旧 CHECK 表（无 status 列）+ FTS5 外部内容表 + 存量行
      oldDb.exec(`
        CREATE TABLE agent_memory (
          id TEXT PRIMARY KEY,
          org_id TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('fact','preference','decision','pattern','entity','enterprise_fact','ga_correction','implementation_plan','sentinel_annotation')),
          confidence REAL NOT NULL DEFAULT 0.5,
          source TEXT NOT NULL DEFAULT 'manual',
          tags TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          expires_at TEXT,
          access_count INTEGER NOT NULL DEFAULT 0,
          UNIQUE(org_id, key)
        );
        CREATE VIRTUAL TABLE agent_memory_fts USING fts5(
          id UNINDEXED, key, value, content='agent_memory', content_rowid='rowid'
        );
        CREATE VIRTUAL TABLE memory_fts_trigram USING fts5(
          id UNINDEXED, key, value, content='agent_memory', content_rowid='rowid', tokenize='trigram'
        );
      `);
      oldDb.prepare(`INSERT INTO agent_memory (id, org_id, key, value, type, tags)
        VALUES ('legacy-mem-1', 'org-d551', 'fact:legacy', '{"v":1}', 'fact', '[]')`).run();

      const { getAgentMemoryStore } = await import('../../src/l4/agent-memory-store');
      const store = getAgentMemoryStore(oldDb);

      // 迁移生效物理证据 1: 新 type 写入成功（旧 CHECK 下抛 CHECK constraint failed）
      const entry = store.remember({
        orgId: 'org-d551', key: 'ga_calibration:probe:1', value: '{"action":"mark_error"}',
        type: 'ga_calibration', confidence: 1.0, source: 'ga:probe', tags: ['ga_calibration'], expiresAt: null,
      });
      expect(entry.id).toBeTruthy();

      // 迁移生效物理证据 2: 存量数据零丢失（重建表复制）
      const legacy = oldDb.prepare(`SELECT * FROM agent_memory WHERE id='legacy-mem-1'`).get() as Record<string, unknown> | undefined;
      expect(legacy).toBeDefined();
      expect(legacy!.type).toBe('fact');

      // 迁移生效物理证据 3: schema_version 含 'd551_memory_type'
      const versions = oldDb.prepare(`SELECT version FROM schema_version`).all() as Array<{ version: string }>;
      expect(versions.map((v) => v.version)).toContain('d551_memory_type');

      // 迁移生效物理证据 4: FTS 全量重索引生效（新行可被全文检索到）
      const ftsHit = oldDb.prepare(
        `SELECT rowid FROM agent_memory_fts WHERE agent_memory_fts MATCH 'mark_error'`,
      ).all() as unknown[];
      expect(ftsHit.length).toBeGreaterThanOrEqual(1);
    } finally {
      oldDb.close();
    }
  });
});
