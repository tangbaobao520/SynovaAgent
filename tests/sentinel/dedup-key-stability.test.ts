/**
 * tests/sentinel/dedup-key-stability.test.ts — D354 去重键稳定性 (K3 N14 根因修复)
 *
 * 契约 (铁律 47/48): 稳定 id = 同输入同 id, 与时间无关。
 *   sig id      — 同一 entity 跨轮聚合 id 相同 (sig_${entity})
 *   notif id    — 同一 signal 跨轮分发 id 相同 (notif-${signal.id})
 *   conflict id — 同一 relatedNodeId 两次冲突检测 id 相同 (conflict-${relatedNodeId})
 *
 * red 基准 (S-5): 修复前 id 含 Date.now()/getTime() → 两次生成 id 不同 (red);
 *                 修复后同输入同 id (green)。
 * 消费传导: signal.id → proactive-push dedupKey (finding.id) → 5 分钟窗口命中;
 *           notif id → dispatchNotification → electron externalId。
 * D580 8-3 口径同步: 通知去重窗口 10min → 5min（D339 裁决 A 落地, runner.resolveNotificationDedupMs）;
 *           去重状态持久化（sentinel_notification_dedup 表, 重启不丢 — 持久化用例见 ticket-store.test.ts）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { aggregateSignals } from '../../src/sentinel/signal-aggregator';
import { SentinelRunner } from '../../src/sentinel/runner';
import { getSentinelRegistry, destroySentinelRegistry } from '../../src/sentinel/registry';
import type { Sentinel, SentinelCheckResult, SentinelFinding } from '../../src/sentinel/types';
import type { CronScheduler } from '../../src/cron/scheduler';

// 捕获 dispatchNotification 的 notification.id — 生产消费点, 稳定 id 传导断言
const { dispatchNotificationMock } = vi.hoisted(() => ({
  dispatchNotificationMock: vi.fn(async () => ({ results: [], degraded: false })),
}));
vi.mock('../../src/notifications/registry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/notifications/registry')>()),
  dispatchNotification: dispatchNotificationMock,
}));

const T0 = new Date('2026-08-18T10:00:00.000Z');

function makeFinding(overrides: Partial<SentinelFinding> = {}): SentinelFinding {
  return {
    id: 'f1', severity: 'warning', title: '测试', description: '', evidence: [],
    suggestion: '', detectedAt: T0.toISOString(),
    ...overrides,
  };
}

function makeResult(sentinelId: string, findings: SentinelFinding[]): SentinelCheckResult {
  return { sentinelId, ok: true, findings, durationMs: 0, checkedAt: T0.toISOString() };
}

function makeSentinel(id: string, findings: SentinelFinding[]): Sentinel {
  return {
    config: {
      id, name: id, description: '', category: 'growth', priority: 'P1', mode: 'manual',
      version: '1', requiredDataSources: [], confidenceModel: 'deterministic',
    },
    async check(_context): Promise<SentinelCheckResult> {
      return makeResult(id, findings);
    },
  };
}

/** 测试专用 runner: db 提供 queryNodes (executeSentinel 图上下文短路路径), getNode 默认无冲突 */
function makeRunner(db: unknown = { queryNodes: () => [], getNode: () => null }): SentinelRunner {
  return new SentinelRunner({} as CronScheduler, db);
}

/** D37 冲突检测 mock db: 每个节点首次查询返回 has_conflict=true, 再次查询返回 null */
function makeConflictDb(): { queryNodes: () => unknown[]; getNode: (id: string) => unknown } {
  // 注: injectConflictFindings 会向正在迭代的 result.findings 追加 conflict finding 且保留
  // relatedNodeId — 若 store 对同一节点持续返回 has_conflict=true 会再次注入 (D37 既有隐患,
  // 超出 D354 范围, 已在交付报告记录)。本 mock 第二次查询返回 null, 模拟"每个节点注入一次"。
  const seen = new Set<string>();
  return {
    queryNodes: () => [],
    getNode: (id: string): unknown => {
      if (seen.has(id)) return null;
      seen.add(id);
      return { id, props: { has_conflict: true, data_versions: ['v1', 'v2'] } };
    },
  };
}

describe('D354 去重键稳定性 — signal id (signal-aggregator)', () => {
  it('同一 entity 跨两轮聚合 (now 相隔 5 分钟) → sig id 相同, 5 分钟去重窗口可命中', () => {
    const results = [makeResult('sentinel-cpc', [makeFinding({ severity: 'warning', title: '团队A: 协议缺失' })])];
    const round1 = aggregateSignals(results, T0);
    const round2 = aggregateSignals(results, new Date('2026-08-18T10:05:00.000Z'));
    expect(round1.signals).toHaveLength(1);
    expect(round2.signals).toHaveLength(1);
    expect(round1.signals[0].id).toBe(round2.signals[0].id);
    expect(round1.signals[0].id).toBe('sig_团队A');
  });

  it('不同 entity → 不同 sig id (回归: id 仍唯一区分不同信号)', () => {
    const results = [
      makeResult('sentinel-cpc', [makeFinding({ severity: 'warning', title: '团队A: 协议缺失' })]),
      makeResult('sentinel-gap-dynamics', [makeFinding({ severity: 'warning', title: '部门B: 能力差距' })]),
    ];
    const { signals } = aggregateSignals(results, T0);
    expect(signals).toHaveLength(2);
    expect(signals[0].id).not.toBe(signals[1].id);
  });
});

describe('D354 去重键稳定性 — conflict finding id (runner)', () => {
  beforeEach(() => {
    destroySentinelRegistry();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('同一 relatedNodeId 两次冲突检测 (时间前进 1 分钟) → conflict id 相同', async () => {
    const runner = makeRunner(makeConflictDb());
    getSentinelRegistry().register(makeSentinel('test-conflict', [
      makeFinding({ id: 'f1', title: '数据: 测试', relatedNodeId: 'node-x' }),
    ]));

    const r1 = await runner.runOnce('test-conflict');
    vi.setSystemTime(new Date('2026-08-18T10:01:00.000Z'));
    const r2 = await runner.runOnce('test-conflict');

    const c1 = r1?.findings.find(f => f.id.startsWith('conflict-'));
    const c2 = r2?.findings.find(f => f.id.startsWith('conflict-'));
    expect(c1).toBeDefined();
    expect(c2).toBeDefined();
    expect(c1?.id).toBe(c2?.id);
    expect(c1?.id).toBe('conflict-node-x');
  });

  it('不同 relatedNodeId → 不同 conflict id (回归: id 仍唯一区分)', async () => {
    const runner = makeRunner(makeConflictDb());
    getSentinelRegistry().register(makeSentinel('test-conflict-2', [
      makeFinding({ id: 'fa', title: '数据: A', relatedNodeId: 'node-a' }),
      makeFinding({ id: 'fb', title: '数据: B', relatedNodeId: 'node-b' }),
    ]));

    const r = await runner.runOnce('test-conflict-2');
    const conflicts = r?.findings.filter(f => f.id.startsWith('conflict-')) ?? [];
    expect(conflicts).toHaveLength(2);
    expect(conflicts[0].id).not.toBe(conflicts[1].id);
  });
});

describe('D354 去重键稳定性 — notification id (runner)', () => {
  beforeEach(() => {
    destroySentinelRegistry();
    dispatchNotificationMock.mockClear();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('同一 signal 跨两轮分发 (间隔 12 分钟, 越过 5 分钟通知去重窗口 — D339 裁决 A) → notif id 相同', async () => {
    const runner = makeRunner();
    getSentinelRegistry().register(makeSentinel('test-notif', [
      makeFinding({ id: 'f1', severity: 'warning', title: '团队A: 协议缺失' }),
    ]));

    await runner.runOnce('test-notif');
    await runner.aggregateAndDispatch(); // 第 1 轮分发
    vi.setSystemTime(new Date('2026-08-18T10:12:00.000Z'));
    await runner.aggregateAndDispatch(); // 第 2 轮分发 (12 分钟 > 5 分钟通知去重窗口 — D580 8-3 口径)

    const notifIds = dispatchNotificationMock.mock.calls.map(c => (c[0] as { id: string }).id);
    expect(notifIds).toHaveLength(2);
    expect(notifIds[0]).toBe(notifIds[1]);
    expect(notifIds[0]).toBe('notif-sig_团队A');
  });

  it('D580 8-3: 同一 signal 窗口内再次聚合 (间隔 3 分钟 < 5 分钟窗口) → 命中去重, 不重发', async () => {
    const runner = makeRunner();
    getSentinelRegistry().register(makeSentinel('test-notif-window', [
      makeFinding({ id: 'f1', severity: 'warning', title: '团队A: 协议缺失' }),
    ]));

    await runner.runOnce('test-notif-window');
    await runner.aggregateAndDispatch(); // 第 1 轮分发
    vi.setSystemTime(new Date('2026-08-18T10:03:00.000Z'));
    await runner.aggregateAndDispatch(); // 第 2 轮 (3 分钟 < 5 分钟窗口) → isNotificationDuplicate 命中

    expect(dispatchNotificationMock).toHaveBeenCalledTimes(1); // 窗口内不重发（去重键稳定 + 窗口语义）
  });

  it('不同 signal → 不同 notif id (回归: id 仍唯一区分)', async () => {
    const runner = makeRunner();
    const registry = getSentinelRegistry();
    registry.register(makeSentinel('test-notif-a', [makeFinding({ id: 'fa', title: '团队A: 协议缺失' })]));
    registry.register(makeSentinel('test-notif-b', [makeFinding({ id: 'fb', title: '部门B: 能力差距' })]));
    await runner.runOnce('test-notif-a');
    await runner.runOnce('test-notif-b');
    await runner.aggregateAndDispatch();

    const notifIds = dispatchNotificationMock.mock.calls.map(c => (c[0] as { id: string }).id);
    expect(notifIds).toHaveLength(2);
    expect(new Set(notifIds).size).toBe(2);
  });
});
