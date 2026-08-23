/**
 * tests/sentinel/self-check.test.ts — D505 哨兵自诊断可信度（S3-5）
 *
 * 契约（铁律 47，先于实现定义）:
 *   evaluateSentinelHealth(state) 纯函数:
 *     H1 loader 健康 — 注册率 = 0 → critical；< 0.8 → warning；≥ 0.8 → 健康
 *     H2 适配器健康 — failures ≥ 5 → critical；≥ 3 → warning；< 3 → 偶发不算（60s 重试已滤）
 *     H3 调度健康  — 从未跑 + uptime > 1h → critical；lastRunAt 陈旧 > maxScheduleMs×3 → warning
 *     健康时零 finding（宁缺毋滥，防噪音化）
 *   runner.runSelfCheck(state?) 集成:
 *     findings 走 persistRunEvents（I2 单源 sentinel_events）+ projectRunRecord（records）
 *     critical → createAutoTicket（sentinel_tickets auto 行）；warning/critical → dispatchNotification
 *     不进 dispatchSignalsToExperts（DS8：企业信号聚合过滤 sentinel-self-check）
 * 铁律 48: 正常（注入故障 → 显式 finding/工单）/ 降级（指标收集异常 → fail-closed warning）/
 *          边界（阈值边界 + 健康零噪音 + 幂等）三路径全覆盖。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

// 时间基准用相对量（H3 陈旧度以真实时钟评估 — 固定日期会随运行日期漂移成时间炸弹）
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const T0_ISO = () => ago(30 * 60 * 1000); // 30 分钟前 — 恒新鲜

// ── 模块级 mock（hoisted 之前定义捕获器） ──
const { dispatchNotificationMock } = vi.hoisted(() => ({
  dispatchNotificationMock: vi.fn(async () => ({ results: [], degraded: false })),
}));

const registryState = { count: 0, cronSentinels: [] as Array<{ sentinel: unknown; cron: string }> };

vi.mock('../../src/sentinel/registry', () => ({
  getSentinelRegistry: () => ({
    count: () => registryState.count,
    listCronSentinels: () => registryState.cronSentinels,
    get: (id: string) => registryState.cronSentinels.find((e) => (e.sentinel as { config: { id: string } }).config.id === id)?.sentinel,
  }),
  destroySentinelRegistry: () => {},
}));

const loaderState = { expected: 46 };

vi.mock('../../src/sentinel/sentinel-loader', () => ({
  loadSentinels: () => ({
    sentinels: Array.from({ length: loaderState.expected }, (_, i) => ({ manifest: { name: `s-${i}` }, dir: `/s-${i}` })),
    degraded: false,
    errors: [],
  }),
  clearSentinelCache: () => {},
  getSentinelsByExpert: () => [],
}));

vi.mock('../../src/notifications/registry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/notifications/registry')>()),
  dispatchNotification: dispatchNotificationMock,
}));

import {
  evaluateSentinelHealth,
  estimateCronIntervalMs,
  HEALTH_REGISTRY_RATIO_WARNING,
  HEALTH_FAILURES_WARNING,
  HEALTH_FAILURES_CRITICAL,
  SELF_CHECK_SENTINEL_ID,
  type SentinelHealthState,
} from '../../src/sentinel/self-check';
import { SentinelRunner } from '../../src/sentinel/runner';
import { createSentinelEventsTable } from '../../src/sentinel/sentinel-events';
import type { CronScheduler } from '../../src/cron/scheduler';

// ── 工具 ──

function makeState(overrides: Partial<SentinelHealthState> = {}): SentinelHealthState {
  return {
    registryCount: 46,
    expectedCount: 46,
    cronJobs: [
      { id: 'job-1', failures: 0, lastRunAt: T0_ISO(), lastError: null },
    ],
    lastRunAt: T0_ISO(),
    maxScheduleMs: 60 * 60 * 1000, // 1h
    uptimeMs: 2 * 60 * 60 * 1000,  // 2h
    ...overrides,
  };
}

type ScheduledJob = { name: string; cron: string; fn: () => Promise<void>; };

function makeScheduler(overrides: Partial<Record<'listJobs' | 'schedule' | 'remove', unknown>> = {}): {
  scheduler: CronScheduler;
  scheduled: ScheduledJob[];
} {
  const scheduled: ScheduledJob[] = [];
  const scheduler = {
    listJobs: () => [],
    schedule: (name: string, cron: string, fn: () => Promise<void>) => {
      scheduled.push({ name, cron, fn });
      return `job-${name}`;
    },
    remove: () => {},
    ...overrides,
  };
  return { scheduler: scheduler as unknown as CronScheduler, scheduled };
}

const TICKET_DDL = `CREATE TABLE IF NOT EXISTS sentinel_tickets (
  id TEXT PRIMARY KEY, signal_id TEXT NOT NULL, severity TEXT NOT NULL, expert_type TEXT NOT NULL,
  diagnosis TEXT, suggested_actions TEXT, status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT (datetime('now')), resolved_at TEXT
)`;

// ═══ L1 单元契约 — evaluateSentinelHealth 纯函数（§7.1 表） ═══

describe('evaluateSentinelHealth — H1 loader 健康', () => {
  it('registryCount=0, expectedCount=46 → critical（loader 全挂）', () => {
    const { healthy, findings } = evaluateSentinelHealth(makeState({ registryCount: 0 }));
    expect(healthy).toBe(false);
    const h1 = findings.filter((f) => f.id.startsWith('self-check-H1'));
    expect(h1).toHaveLength(1);
    expect(h1[0].severity).toBe('critical');
    expect(h1[0].title).toContain('未注册');
  });

  it('registryCount=30/46（<0.8）→ warning（部分注册失败）', () => {
    const { findings } = evaluateSentinelHealth(makeState({ registryCount: 30 }));
    const h1 = findings.filter((f) => f.id.startsWith('self-check-H1'));
    expect(h1).toHaveLength(1);
    expect(h1[0].severity).toBe('warning');
  });

  it('registryCount=40/46（≥0.8）→ 无 H1 finding（健康零噪音）', () => {
    const { healthy, findings } = evaluateSentinelHealth(makeState({ registryCount: 40 }));
    expect(healthy).toBe(true);
    expect(findings.filter((f) => f.id.startsWith('self-check-H1'))).toHaveLength(0);
  });

  it('边界：恰好 0.8（36.8→37/46 覆盖）不告警，0.79 告警', () => {
    // 46×0.8=36.8 → 37 ≥ 阈值；36 < 阈值
    expect(evaluateSentinelHealth(makeState({ registryCount: 37 })).healthy).toBe(true);
    expect(evaluateSentinelHealth(makeState({ registryCount: 36 })).findings
      .some((f) => f.id.startsWith('self-check-H1'))).toBe(true);
  });

  it('边界：expectedCount=0（无 manifest）→ 不误报 H1', () => {
    const { healthy } = evaluateSentinelHealth(makeState({ expectedCount: 0, registryCount: 0 }));
    expect(healthy).toBe(true);
  });

  it(`阈值常量暴露（${HEALTH_REGISTRY_RATIO_WARNING}）— 编码可核`, () => {
    expect(HEALTH_REGISTRY_RATIO_WARNING).toBe(0.8);
  });
});

describe('evaluateSentinelHealth — H2 适配器健康', () => {
  it('failures=5 → critical', () => {
    const { findings } = evaluateSentinelHealth(makeState({
      cronJobs: [{ id: 'job-x', failures: 5, lastRunAt: T0_ISO(), lastError: 'boom' }],
    }));
    const h2 = findings.filter((f) => f.id.startsWith('self-check-H2'));
    expect(h2).toHaveLength(1);
    expect(h2[0].severity).toBe('critical');
    expect(h2[0].title).toContain('job-x');
  });

  it('failures=3 → warning；failures=2 → 无 finding（偶发不算）', () => {
    const warn = evaluateSentinelHealth(makeState({
      cronJobs: [{ id: 'job-w', failures: 3, lastRunAt: null, lastError: null }],
    })).findings.filter((f) => f.id.startsWith('self-check-H2'));
    expect(warn).toHaveLength(1);
    expect(warn[0].severity).toBe('warning');

    const none = evaluateSentinelHealth(makeState({
      cronJobs: [{ id: 'job-o', failures: 2, lastRunAt: null, lastError: null }],
    })).findings.filter((f) => f.id.startsWith('self-check-H2'));
    expect(none).toHaveLength(0);
  });

  it(`阈值常量暴露（warning=${HEALTH_FAILURES_WARNING}, critical=${HEALTH_FAILURES_CRITICAL}）`, () => {
    expect(HEALTH_FAILURES_WARNING).toBe(3);
    expect(HEALTH_FAILURES_CRITICAL).toBe(5);
  });
});

describe('evaluateSentinelHealth — H3 调度健康', () => {
  it('lastRunAt=null + uptime>1h → critical（空转）', () => {
    const { findings } = evaluateSentinelHealth(makeState({ lastRunAt: null }));
    const h3 = findings.filter((f) => f.id.startsWith('self-check-H3'));
    expect(h3).toHaveLength(1);
    expect(h3[0].severity).toBe('critical');
  });

  it('lastRunAt=null + uptime<1h → 无 finding（刚启动不算空转）', () => {
    const { healthy } = evaluateSentinelHealth(makeState({ lastRunAt: null, uptimeMs: 10 * 60 * 1000 }));
    expect(healthy).toBe(true);
  });

  it('lastRunAt 距今 > maxScheduleMs×3 → warning（陈旧）', () => {
    const stale = ago(4 * 60 * 60 * 1000); // 4h > 1h×3
    const { findings } = evaluateSentinelHealth(makeState({ lastRunAt: stale }));
    const h3 = findings.filter((f) => f.id.startsWith('self-check-H3'));
    expect(h3).toHaveLength(1);
    expect(h3[0].severity).toBe('warning');
  });

  it('lastRunAt 距今 < maxScheduleMs×3 → 无 finding（正常不误报）', () => {
    const fresh = ago(30 * 60 * 1000);
    const { healthy } = evaluateSentinelHealth(makeState({ lastRunAt: fresh }));
    expect(healthy).toBe(true);
  });
});

describe('evaluateSentinelHealth — 综合 + finding 契约', () => {
  it('全部健康 → { healthy: true, findings: [] }（宁缺毋滥）', () => {
    expect(evaluateSentinelHealth(makeState())).toEqual({ healthy: true, findings: [] });
  });

  it('finding 字段契约：id 稳定（self-check-H#-N）、severity、detectedAt、status=open', () => {
    const { findings } = evaluateSentinelHealth(makeState({ registryCount: 0, lastRunAt: null }));
    expect(findings.length).toBeGreaterThanOrEqual(2);
    for (const f of findings) {
      expect(f.id).toMatch(/^self-check-H[123]-\d+$/);
      expect(['critical', 'warning']).toContain(f.severity);
      expect(f.detectedAt).toBeTruthy();
      expect(f.status).toBe('open');
      expect(f.evidence).toEqual(expect.any(Array));
      expect(f.suggestion).toBeTruthy();
    }
    // 稳定 id：同输入两次评估 → 相同 id（D354 去时间戳精神）
    const again = evaluateSentinelHealth(makeState({ registryCount: 0, lastRunAt: null }));
    expect(again.findings.map((f) => f.id)).toEqual(findings.map((f) => f.id));
  });

  it('不抛：异常输入（NaN/负值）→ 纯函数保守处理', () => {
    expect(() => evaluateSentinelHealth(makeState({ registryCount: Number.NaN }))).not.toThrow();
  });
});

describe('estimateCronIntervalMs — cron 间隔估算', () => {
  it('每小时 cron（5 * * * *）→ 1h', () => {
    expect(estimateCronIntervalMs('5 * * * *')).toBe(60 * 60 * 1000);
  });
  it('每天 cron（0 3 * * *）→ 24h', () => {
    expect(estimateCronIntervalMs('0 3 * * *')).toBe(24 * 60 * 60 * 1000);
  });
  it('每 6 小时（0 */6 * * *）→ 6h', () => {
    expect(estimateCronIntervalMs('0 */6 * * *')).toBe(6 * 60 * 60 * 1000);
  });
  it('每月（0 3 1 * *）→ 30d；未识别形态 → 兜底 24h', () => {
    expect(estimateCronIntervalMs('0 3 1 * *')).toBe(30 * 24 * 60 * 60 * 1000);
    expect(estimateCronIntervalMs('weird')).toBe(24 * 60 * 60 * 1000);
  });
});

// ═══ L2 集成 — runner.runSelfCheck（§7.2/7.3/7.4） ═══

describe('SentinelRunner.runSelfCheck — 注入故障 → 显式 degraded 信号', () => {
  let db: Database.Database;
  let runner: SentinelRunner;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(TICKET_DDL);
    createSentinelEventsTable(db);
    dispatchNotificationMock.mockClear();
    registryState.count = 46;
    registryState.cronSentinels = [];
    loaderState.expected = 46;
    const { scheduler } = makeScheduler();
    runner = new SentinelRunner(scheduler, db);
  });

  afterEach(() => {
    db.close();
  });

  function findingsInRecords(): number {
    const runs = runner.getRecentResults().get(SELF_CHECK_SENTINEL_ID) ?? [];
    return runs.flatMap((r) => r.result.findings).length;
  }

  function ticketRows(): Array<{ signal_id: string; severity: string; expert_type: string }> {
    return db.prepare('SELECT signal_id, severity, expert_type FROM sentinel_tickets').all() as Array<{ signal_id: string; severity: string; expert_type: string }>;
  }

  function eventCount(type: string, sentinelId?: string): number {
    if (sentinelId === undefined) {
      return (db.prepare('SELECT COUNT(*) AS c FROM sentinel_events WHERE event_type = ?').get(type) as { c: number }).c;
    }
    return (db.prepare('SELECT COUNT(*) AS c FROM sentinel_events WHERE event_type = ? AND sentinel_id = ?').get(type, sentinelId) as { c: number }).c;
  }

  it('注入故障：loader 全挂（registry 0/46）→ H1 critical finding + I2 事件流 + 工单 + 通知', async () => {
    await runner.runSelfCheck(makeState({ registryCount: 0 }));

    expect(findingsInRecords()).toBeGreaterThanOrEqual(1);
    // I2 单源（DS9）: run_completed + finding 事件写入 sentinel_events
    expect(eventCount('run_completed', SELF_CHECK_SENTINEL_ID)).toBe(1);
    expect(eventCount('finding', SELF_CHECK_SENTINEL_ID)).toBeGreaterThanOrEqual(1);
    // DS5: critical → 工单（auto 行）
    const tickets = ticketRows();
    expect(tickets).toHaveLength(1);
    expect(tickets[0].expert_type).toBe('auto');
    expect(tickets[0].severity).toBe('critical');
    expect(tickets[0].signal_id).toContain('self-check');
    // DS6: warning/critical → 桌面通知
    expect(dispatchNotificationMock).toHaveBeenCalled();
  });

  it('注入故障：适配器连续失败 failures=5 → H2 critical → 工单', async () => {
    await runner.runSelfCheck(makeState({
      cronJobs: [{ id: 'job-crash', failures: 5, lastRunAt: null, lastError: 'adapter crashed' }],
    }));
    const tickets = ticketRows();
    expect(tickets).toHaveLength(1);
    expect(tickets[0].severity).toBe('critical');
  });

  it('注入故障：调度空转（lastRunAt=null + uptime>1h）→ H3 critical finding', async () => {
    await runner.runSelfCheck(makeState({ lastRunAt: null }));
    const runs = runner.getRecentResults().get(SELF_CHECK_SENTINEL_ID) ?? [];
    const h3 = runs.flatMap((r) => r.result.findings).filter((f) => f.id.startsWith('self-check-H3'));
    expect(h3).toHaveLength(1);
    expect(h3[0].severity).toBe('critical');
  });

  it('健康状态 → 零 finding 零工单零通知（宁缺毋滥，DS7）', async () => {
    await runner.runSelfCheck(makeState());
    expect(findingsInRecords()).toBe(0);
    expect(ticketRows()).toHaveLength(0);
    expect(dispatchNotificationMock).not.toHaveBeenCalled();
  });

  it('降级路径：指标收集异常（listJobs 抛错）→ fail-closed warning finding（铁律 24/31）', async () => {
    const { scheduler } = makeScheduler({
      listJobs: () => { throw new Error('scheduler unavailable'); },
    });
    const failing = new SentinelRunner(scheduler, db);
    await failing.runSelfCheck();
    const runs = failing.getRecentResults().get(SELF_CHECK_SENTINEL_ID) ?? [];
    const collected = runs.flatMap((r) => r.result.findings);
    expect(collected.length).toBeGreaterThanOrEqual(1);
    expect(collected.some((f) => f.title.includes('指标收集') || f.id.startsWith('self-check-H2'))).toBe(true);
  });

  it('幂等边界：同小时窗口重复 runSelfCheck → 工单行数不增（INSERT OR REPLACE）', async () => {
    await runner.runSelfCheck(makeState({ registryCount: 0 }));
    await runner.runSelfCheck(makeState({ registryCount: 0 }));
    expect(ticketRows()).toHaveLength(1);
  });

  it('DS8：self-check finding 不进企业信号聚合（aggregateAndDispatch 过滤）', async () => {
    await runner.runSelfCheck(makeState({ registryCount: 0 }));
    await runner.aggregateAndDispatch();
    expect(eventCount('signal', SELF_CHECK_SENTINEL_ID)).toBe(0);
    // 但 finding 事件仍在（I2 可见性不受聚合过滤影响）
    expect(eventCount('finding', SELF_CHECK_SENTINEL_ID)).toBeGreaterThanOrEqual(1);
  });
});

describe('SentinelRunner.start — SentinelSelfCheck cron 注册（WIRE CHECK）', () => {
  it('即使 registry 空（loader 全挂）也注册 SentinelSelfCheck（每小时）', () => {
    registryState.count = 0;
    registryState.cronSentinels = [];
    const db = new Database(':memory:');
    createSentinelEventsTable(db);
    const { scheduler, scheduled } = makeScheduler();
    const runner = new SentinelRunner(scheduler, db);
    runner.start();
    const selfCheck = scheduled.find((j) => j.name === 'SentinelSelfCheck');
    expect(selfCheck).toBeDefined();
    expect(selfCheck?.cron).toBe('0 * * * *');
    db.close();
  });
});
