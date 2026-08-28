/**
 * tests/sentinel/ga-manual-injection.test.ts — D551 GA 手动信号注入（DS5）
 *
 * 契约优先（铁律 47+48）: spec §6.2/§7.3 → 测试 → 实现。
 * 覆盖:
 *   - ⑧ injectManualSignal → runner.injectManualFinding → sentinel_events 含 finding 事件
 *     （sentinel_id='ga-manual'）+ getRecentResults 投影可见 + getSentinelFindings 输出含该 finding
 *     （对齐 tests/sentinel/sentinel-events.test.ts 内存 SQLite 惯例；red: 注入旁路不进投影时投影断言红）
 *   - ⑧b 路由级全链: POST /api/ga/calibration/signals → 201 {signalId, findingId} + manual_signal memory 条目
 *   - ⑨ 边界: severity/confidence 越界在路由层拦截（不落事件——red: 旁路直写事件表时"零事件"断言红）
 *   - ⑩ 降级: runner 未初始化（getGlobalSentinelRunner null）→ 服务函数 degraded 返回（对齐 sentinel-service L79-84 模式）
 *   - severity 1-10 → emergency/critical/warning/info 映射契约 + finding.source='GA_MANUAL' 元数据
 *   - I1 可重建: 注入记录经 rebuildFromEvents 重放后不丢（事件流单源）
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import type { Router, Request, Response } from 'express';
import {
  createSentinelEventsTable,
  replaySentinelEvents,
} from '../../src/sentinel/sentinel-events';
import { SentinelRunner, setGlobalSentinelRunner } from '../../src/sentinel/runner';
import { CronScheduler } from '../../src/cron/scheduler';
import { injectManualSignal, getSentinelFindings } from '../../src/agent/sentinel-service';
import type { SentinelFinding } from '../../src/sentinel/types';

// ═══ hoisted + mock（engine-context → 内存库，供路由 getStore 使用） ═══

const state = vi.hoisted(() => ({
  db: null as Database | null,
}));

vi.mock('../../src/init/engine-context', () => ({
  getDatabase: () => {
    if (!state.db) throw new Error('测试 db 未就绪');
    return state.db;
  },
}));

// ═══ 路由调用工具（对齐 ga-calibration.test.ts，零 as any） ═══

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

async function callSignalsRoute(body: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> }> {
  const mod = await import('../../src/routes/ga-calibration');
  const handler = getHandler(mod.default, 'post', '/api/ga/calibration/signals');
  const captured: { code: number; json: Record<string, unknown> | undefined } = { code: 200, json: undefined };
  const res = {
    status(code: number): Response { captured.code = code; return res as unknown as Response; },
    json(b: unknown): Response { captured.json = b as Record<string, unknown>; return res as unknown as Response; },
  } as unknown as Response;
  const req = {
    auth: { sub: 'ga-user-1', role: 'ga', orgId: 'org-d551' },
    body,
    query: {},
    headers: {},
  } as unknown as Request;
  await handler(req, res, () => {});
  return { status: captured.code, body: captured.json ?? {} };
}

const VALID_SIGNAL = {
  signalType: '人员变动',
  title: 'CTO 离职',
  description: '关键人变动，人才梯队断层风险',
  severity: 8,
  confidence: 90,
  relatedEdges: ['E-15'],
  relatedNodes: ['person-cto'],
};

// ═══ Setup（对齐 sentinel-events.test.ts L111-123） ═══

let db: Database;
let scheduler: CronScheduler;
let runner: SentinelRunner;

beforeEach(() => {
  db = new Database(':memory:');
  state.db = db;
  scheduler = new CronScheduler(db);
  runner = new SentinelRunner(scheduler, db);
  createSentinelEventsTable(db);
});

afterEach(() => {
  setGlobalSentinelRunner(null);
  scheduler.stop();
  db.close();
  state.db = null;
});

// ═══ ⑧ 服务级注入链 ═══

describe('injectManualSignal → runner 注入链（DS5 用例⑧）', () => {
  it('注入 → sentinel_events 含 ga-manual finding 事件 + run_completed + 投影可见 + findings API 可见', () => {
    setGlobalSentinelRunner(runner);
    const out = injectManualSignal({
      signalType: '人员变动', title: 'CTO 离职', description: '关键人变动',
      severity: 8, confidence: 90, relatedEdges: ['E-15'], relatedNodes: ['person-cto'],
      gaId: 'ga-user-1', orgId: 'org-d551',
    });
    expect(out.ok).toBe(true);
    expect(typeof out.findingId).toBe('string');
    const findingId = out.findingId as string;

    // 事件流: finding 事件（sentinel_id='ga-manual'）+ run_completed 聚合锚点（I2 单源）
    const events = replaySentinelEvents(db);
    const findingEvent = events.find(
      (e) => e.event_type === 'finding' && e.sentinel_id === 'ga-manual'
        && (e.payload.finding as SentinelFinding).id === findingId,
    );
    expect(findingEvent).toBeDefined();
    expect(events.some((e) => e.event_type === 'run_completed' && e.sentinel_id === 'ga-manual')).toBe(true);

    // 投影: getRecentResults 含注入 record（red: 旁路写事件表不进投影时此断言红）
    const runs = runner.getRecentResults().get('ga-manual');
    expect(runs).toHaveLength(1);
    const injected = runs![0].result.findings.find((f) => f.id === findingId);
    expect(injected).toBeDefined();
    expect(injected!.title).toBe('CTO 离职');
    // GA_MANUAL 元数据（spec §6.2: source 字段载 GA_MANUAL 元数据）
    expect((injected as (SentinelFinding & { source?: string })).source).toBe('GA_MANUAL');
    expect(injected!.evidence.some((e) => e.startsWith('signalType=人员变动'))).toBe(true);
    expect(injected!.evidence).toContain('source=GA_MANUAL');

    // findings API: /api/sentinel/findings 同链路可见
    setGlobalSentinelRunner(runner);
    const api = getSentinelFindings({ sentinelId: 'ga-manual' });
    expect(api.ok).toBe(true);
    expect(api.findings.some((f) => f.finding.id === findingId)).toBe(true);
  });

  it('I1 可重建: 注入记录经 rebuildFromEvents 重放后不丢（事件流单源，重启不丢注入）', () => {
    setGlobalSentinelRunner(runner);
    const out = injectManualSignal({
      signalType: '竞品动态', title: '竞品降价 20%', description: '价格战信号',
      severity: 6, confidence: 70, gaId: 'ga-user-1', orgId: 'org-d551',
    });
    expect(out.ok).toBe(true);
    runner.rebuildFromEvents();
    const runs = runner.getRecentResults().get('ga-manual');
    expect(runs).toHaveLength(1);
    expect(runs![0].result.findings.some((f) => f.id === out.findingId)).toBe(true);
  });

  it('severity 映射契约: 1-3 info / 4-6 warning / 7-8 critical / 9-10 emergency', () => {
    setGlobalSentinelRunner(runner);
    const cases: Array<{ severity: number; expected: SentinelFinding['severity'] }> = [
      { severity: 2, expected: 'info' },
      { severity: 5, expected: 'warning' },
      { severity: 8, expected: 'critical' },
      { severity: 10, expected: 'emergency' },
    ];
    for (const c of cases) {
      const out = injectManualSignal({
        signalType: '其他', title: `映射-${c.severity}`, description: 'x',
        severity: c.severity, confidence: 50, gaId: 'ga-user-1', orgId: 'org-d551',
      });
      expect(out.ok).toBe(true);
      const runs = runner.getRecentResults().get('ga-manual');
      const last = runs![runs!.length - 1];
      expect(last.result.findings[0].severity).toBe(c.expected);
    }
  });
});

// ═══ ⑧b 路由级全链（L1→L2→L3 + memory 双落） ═══

describe('POST /api/ga/calibration/signals — 路由级全链（DS5）', () => {
  it('合法信号 → 201 {ok, signalId, findingId} + manual_signal memory 条目 + 事件行', async () => {
    setGlobalSentinelRunner(runner);
    const out = await callSignalsRoute({ ...VALID_SIGNAL });
    expect(out.status).toBe(201);
    expect(out.body.ok).toBe(true);
    expect(typeof out.body.signalId).toBe('string');
    expect(typeof out.body.findingId).toBe('string');
    const findingId = out.body.findingId as string;

    const events = replaySentinelEvents(db);
    expect(events.some((e) => e.event_type === 'finding' && e.sentinel_id === 'ga-manual')).toBe(true);

    // memory 审计条目（append-only，DS3 type='manual_signal'）
    const { getAgentMemoryStore } = await import('../../src/l4/agent-memory-store');
    const store = getAgentMemoryStore(db);
    const entries = store.list({ orgId: 'org-d551', tags: ['manual_signal'], limit: 10 });
    const mine = entries.find((e) => {
      const val = JSON.parse(e.value) as Record<string, unknown>;
      return val.findingId === findingId;
    });
    expect(mine).toBeDefined();
    expect(mine!.type).toBe('manual_signal');
  });
});

// ═══ ⑨ 边界: 越界在路由层拦截，不落事件 ═══

describe('POST /api/ga/calibration/signals — 越界拦截不落事件（DS5 用例⑨）', () => {
  it('severity=11 → 400 且 sentinel_events 零行（red: 旁路直写事件表时此断言红）', async () => {
    setGlobalSentinelRunner(runner);
    const out = await callSignalsRoute({ ...VALID_SIGNAL, severity: 11 });
    expect(out.status).toBe(400);
    expect(replaySentinelEvents(db)).toHaveLength(0);
  });

  it('confidence=101 → 400 且不落事件 + 不落 memory', async () => {
    setGlobalSentinelRunner(runner);
    const out = await callSignalsRoute({ ...VALID_SIGNAL, confidence: 101 });
    expect(out.status).toBe(400);
    expect(replaySentinelEvents(db)).toHaveLength(0);
    const { getAgentMemoryStore } = await import('../../src/l4/agent-memory-store');
    const store = getAgentMemoryStore(db);
    expect(store.list({ orgId: 'org-d551', tags: ['manual_signal'], limit: 10 })).toHaveLength(0);
  });
});

// ═══ ⑩ 降级: runner 未初始化 ═══

describe('runner 未初始化 → 服务 degraded 返回（DS5 用例⑩，铁律 24/31）', () => {
  it('服务级: getGlobalSentinelRunner null → {ok:false, degraded:true, findingId:null}', () => {
    setGlobalSentinelRunner(null);
    const out = injectManualSignal({
      signalType: '市场传闻', title: 'x', description: 'x', severity: 5, confidence: 50,
      gaId: 'ga-user-1', orgId: 'org-d551',
    });
    expect(out.ok).toBe(false);
    expect(out.degraded).toBe(true);
    expect(out.findingId).toBeNull();
    expect(typeof out.error).toBe('string');
  });

  it('路由级: 503 + degraded:true（降级信号传播到调用方）', async () => {
    setGlobalSentinelRunner(null);
    const out = await callSignalsRoute({ ...VALID_SIGNAL });
    expect(out.status).toBe(503);
    expect(out.body.degraded).toBe(true);
    expect(out.body.ok).toBe(false);
  });
});
