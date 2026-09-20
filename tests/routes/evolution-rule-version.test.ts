/**
 * tests/routes/evolution-rule-version.test.ts — D829 验收点③：规则版本管理可观测
 *
 * 目标（穿真实入口，禁 mock 管线）:
 *   一次真实规则更新（POST /api/evolution/proposals/:id/approve）→ 留下版本记录。
 *
 * 链路: 路由 handler（真实）→ loadMemoryStore（真实 AgentMemoryStore + 内存 SQLite）
 *       → approveProposal → RuleVersionManager.createSnapshot（写 enterprise_fact + tags[evolution_snapshot]）
 *       → gradualRollout（写 threshold_adjustment）→ 提案状态 approved
 * L3WriteAPI 由真实 SentinelRunner.getL0API() 提供（setGlobalSentinelRunner 注入，非 mock 对象）。
 *
 * 惯例（对齐 tests/routes/ga-calibration.test.ts）: 用例内动态 import 路由模块 +
 * vi.mock engine-context 注入内存 SQLite；不启动 HTTP 服务器。
 *
 * 边界: 本文件不改 src/routes/evolution.ts（D829 写集外）——只提供证据；若驱动该 handler
 *       必须改该文件 → 停手报队长（队长硬条件）。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Database from 'better-sqlite3';
import type { Router, Request, Response } from 'express';

// ═══ hoisted 状态 ═══
const state = vi.hoisted(() => {
  // enterprise_fact 双写落盘隔离（同 ga-calibration 测试；M1 工作树洁净）
  const tmpBase = process.env.TMPDIR || process.env.TEMP || '/tmp';
  process.env.SYNO_FACTS_ROOT = `${tmpBase.replace(/\/$/, '')}/synova-d829-rule-version-${process.pid}`;
  return { db: null as Database | null };
});

const logs = vi.hoisted(() => ({ warns: [] as unknown[][], errors: [] as unknown[][] }));

vi.mock('../../src/init/engine-context', () => ({
  getDatabase: () => {
    if (!state.db) throw new Error('测试 db 未就绪');
    return state.db;
  },
}));

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

// ═══ 工具（对齐 ga-calibration.test.ts 的 express Router stack 直取 handler） ═══

interface RouteLayer {
  route?: {
    path?: string;
    methods?: Record<string, boolean>;
    stack: Array<{ handle: (req: Request, res: Response, next: () => void) => unknown }>;
  };
}

function getHandler(router: Router, method: 'get' | 'post', path: string) {
  const stack = (router as unknown as { stack: RouteLayer[] }).stack;
  for (const layer of stack) {
    if (layer.route?.path === path && layer.route.methods?.[method]) {
      return layer.route.stack[0].handle;
    }
  }
  throw new Error(`route 未注册: ${method.toUpperCase()} ${path}`);
}

function makeReq(opts: { params?: Record<string, string>; body?: Record<string, unknown> }): Request {
  return {
    params: opts.params ?? {},
    body: opts.body ?? {},
    query: {},
    headers: {},
  } as unknown as Request;
}

function makeRes(): { res: Response; status: () => number; body: () => Record<string, unknown> } {
  const captured: { code: number; json: Record<string, unknown> | undefined } = { code: 200, json: undefined };
  const res = {
    status(code: number): Response { captured.code = code; return res as unknown as Response; },
    json(b: unknown): Response { captured.json = b as Record<string, unknown>; return res as unknown as Response; },
  } as unknown as Response;
  return { res, status: () => captured.code, body: () => captured.json ?? {} };
}

// ═══ Setup ═══

const PROPOSAL_ID = 'prop-d829-1';
const SENTINEL_ID = 'sentinel-d829-rule';
let db: Database;
let stopScheduler: (() => void) | null = null;

function pendingProposal() {
  return {
    id: PROPOSAL_ID,
    type: 'threshold_adjustment',
    title: 'D829 规则更新（阈值调整）',
    description: '行业聚合建议上调 warning 阈值',
    industry: 'saas',
    changes: [{ sentinelId: SENTINEL_ID, from: { warning: 0.5, critical: 1.0 }, to: { warning: 0.6, critical: 1.1 } }],
    risk: 'low',
    impactEstimate: { orgCount: 1, sentinelIds: [SENTINEL_ID] },
    evidence: 'D829 验收点③',
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

beforeAll(async () => {
  db = new Database(':memory:');
  state.db = db;

  // 种子: pending 提案（approveProposal 从 memoryStore.recall('global', `proposal_<id>`) 读取）
  const { getAgentMemoryStore } = await import('../../src/l4/agent-memory-store');
  getAgentMemoryStore(db).remember({
    orgId: 'global', key: `proposal_${PROPOSAL_ID}`, value: JSON.stringify(pendingProposal()),
    type: 'enterprise_fact', confidence: 0.9, source: 'test-seed', tags: ['proposal', 'saas', 'pending'], expiresAt: null,
  });

  // 真实 L3WriteAPI 来源: 真实 SentinelRunner + 真实 CronScheduler（注入全局，非 mock 对象）
  const { SentinelRunner, setGlobalSentinelRunner } = await import('../../src/sentinel/runner');
  const { CronScheduler } = await import('../../src/cron/scheduler');
  const scheduler = new CronScheduler(db);
  const runner = new SentinelRunner(scheduler, db);
  setGlobalSentinelRunner(runner);
  stopScheduler = () => { scheduler.stop(); setGlobalSentinelRunner(null); };
});

afterAll(() => {
  stopScheduler?.();
  db.close();
  state.db = null;
});

// ═══ 验收点③ ═══

describe('D829 验收点③ — 一次规则更新留下版本记录（穿真实 approve 路由）', () => {
  it('POST /api/evolution/proposals/:id/approve → 200 + 提案 approved + 快照版本记录落库 + 阈值灰度落地', async () => {
    const mod = await import('../../src/routes/evolution');
    const handler = getHandler(mod.default, 'post', '/api/evolution/proposals/:id/approve');
    const { res, status, body } = makeRes();
    await handler(makeReq({ params: { id: PROPOSAL_ID }, body: { orgPool: ['org-d829'] } }), res, () => {});

    expect(status()).toBe(200);
    expect(body().ok).toBe(true);
    const proposal = body().proposal as { status?: string; appliedSnapshotId?: string; rolloutPercentage?: number };
    expect(proposal.status).toBe('approved');
    expect(typeof proposal.appliedSnapshotId).toBe('string');
    expect(proposal.rolloutPercentage).toBe(10);

    // 版本记录（物理证据 1）: AgentMemoryStore 出现 tags 含 evolution_snapshot 的行
    const { getAgentMemoryStore } = await import('../../src/l4/agent-memory-store');
    const store = getAgentMemoryStore(db);
    const snapshots = store.list({ orgId: 'global', type: 'enterprise_fact', tags: ['evolution_snapshot'], limit: 50 });
    expect(snapshots.length).toBeGreaterThanOrEqual(1);
    const snap = snapshots.find((s) => s.value.includes(PROPOSAL_ID));
    expect(snap).toBeDefined();
    const parsed = JSON.parse(snap!.value) as { id?: string; version?: string; checksum?: string; data?: { thresholds?: unknown[] } };
    expect(parsed.id).toBe(proposal.appliedSnapshotId);
    expect(typeof parsed.checksum).toBe('string');
    expect(parsed.version).toBe('1.0');

    // 版本记录（物理证据 2）: RuleVersionManager.listSnapshots() 能看到（可观测读路径）
    const { RuleVersionManager } = await import('@synova/evolution');
    const listed = new RuleVersionManager(store).listSnapshots();
    expect(listed.some((s) => s.id === proposal.appliedSnapshotId)).toBe(true);
    expect(listed.find((s) => s.id === proposal.appliedSnapshotId)!.verified).toBe(true);

    // 规则更新真落地（物理证据 3）: 10% 灰度 → 目标 org 的阈值调整条目
    const adjustments = store.list({ orgId: 'org-d829', type: 'enterprise_fact', tags: ['threshold_adjustment'], limit: 50 });
    expect(adjustments.length).toBeGreaterThanOrEqual(1);
    const adj = JSON.parse(adjustments[0].value) as { sentinelId?: string; newThreshold?: { critical?: number } };
    expect(adj.sentinelId).toBe(SENTINEL_ID);
    expect(adj.newThreshold?.critical).toBe(1.1);
  });

  it('边界: 不存在的提案 → 404（不伪造成功）', async () => {
    const mod = await import('../../src/routes/evolution');
    const handler = getHandler(mod.default, 'post', '/api/evolution/proposals/:id/approve');
    const { res, status, body } = makeRes();
    await handler(makeReq({ params: { id: 'prop-does-not-exist' }, body: {} }), res, () => {});
    expect(status()).toBe(404);
    expect(body().ok).toBe(false);
  });
});
