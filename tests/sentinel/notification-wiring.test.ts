/**
 * tests/sentinel/notification-wiring.test.ts — D716 通知决策接线（L2a 接线 + L2b 降级 + L2c 边界）
 *
 * 覆盖 spec §7 T7-T12 + listEscalationQueue 读接口（DS8）:
 *   T7  L2a runner 聚合派发路径调 decideNotification, 契约 channels 真实影响派发目标
 *   T8  L2a resolveThresholds 契约优先（契约 > memStore > manifest）; 删契约 → 回落旧链零回归
 *   T9  L2a 一次派发后 sentinel_notification_state 有行且 last_notified_severity 正确
 *   T10 L2b 状态表读失败（表缺失）→ readNotificationState 返回 null + 决策按首次（宁可多发不吞真告警）
 *   T11 L2b 状态表写失败 → 派发不被阻断 + log.warn（不静默, 铁律 24/31）
 *   T12 L2b 契约 degraded 传播: loader degraded=true 时决策仍产出动作, 调用方日志含原因
 *   +EQ  升级队列: 未回应/停滞行 → runner.listEscalationQueue 输出（含停滞天数; Mac → Win 唯一接口面）
 *
 * 模式: 对齐 dedup-key-stability / ticket-store 先例 — mock dispatchNotification（生产消费点捕获）,
 *   真实 runner + better-sqlite3 ':memory:'（不 mock 管线, 铁律 12）; 契约文件写 OS tmp 目录
 *   经 SYNOVA_DB_PATH → loadConfig().dbPath → dirname 全真链路（不碰真实 data/synova.db）。
 * red 基线（实现前实测）: decideNotification/状态表/契约 loader 不存在 → 全部红。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import Database from 'better-sqlite3';
import { SentinelRunner, setGlobalSentinelRunner } from '../../src/sentinel/runner';
import { getSentinelRegistry, destroySentinelRegistry } from '../../src/sentinel/registry';
import {
  createNotificationStateTable,
  readNotificationState,
} from '../../src/sentinel/notification-policy';
import {
  clearMonitoringContractCache,
  loadMonitoringContract,
  type EffectiveContract,
} from '../../src/sentinel/monitoring-contract';
import { resolveThresholds } from '../../src/sentinel/sentinel-loader';
import {
  registerNotificationAdapter,
  unregisterNotificationAdapter,
  type NotificationAdapter,
} from '../../src/notifications/registry';
import type { Sentinel, SentinelFinding, SentinelCheckResult } from '../../src/sentinel/types';
import type { CronScheduler } from '../../src/cron/scheduler';

// ═══ Mock: dispatchNotification 捕获 + logger 捕获（先例: ticket-store.test.ts） ═══

const { dispatchNotificationMock, logMock } = vi.hoisted(() => ({
  dispatchNotificationMock: vi.fn(async () => ({ results: [], degraded: false })),
  logMock: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() },
}));
vi.mock('../../src/notifications/registry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/notifications/registry')>()),
  dispatchNotification: dispatchNotificationMock,
}));
vi.mock('@synova/logger', () => ({ logger: logMock, createLogger: vi.fn(() => logMock) }));

// ═══ 工具 ═══

const T0 = new Date('2026-09-13T10:00:00.000Z');
const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;

const TICKET_DDL = `CREATE TABLE IF NOT EXISTS sentinel_tickets (
  id TEXT PRIMARY KEY,
  signal_id TEXT NOT NULL,
  severity TEXT NOT NULL,
  expert_type TEXT NOT NULL,
  diagnosis TEXT,
  suggested_actions TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
)`;

const emailAdapter: NotificationAdapter = {
  channel: 'email',
  shouldHandle: () => true,
  send: async () => ({ success: true }),
};

function makeFinding(overrides: Partial<SentinelFinding> = {}): SentinelFinding {
  return {
    id: 'f1', severity: 'critical', title: '团队A: 现金流危急', description: '跑道 0.3 个月',
    evidence: [], suggestion: '应急融资', detectedAt: T0.toISOString(),
    ...overrides,
  };
}

function makeSentinel(id: string, findings: SentinelFinding[]): Sentinel {
  return {
    config: {
      id, name: id, description: '', category: 'growth', priority: 'P1', mode: 'manual',
      version: '1', requiredDataSources: [], confidenceModel: 'deterministic',
    },
    async check(_context): Promise<SentinelCheckResult> {
      return { sentinelId: id, ok: true, findings, durationMs: 0, checkedAt: T0.toISOString() };
    },
  };
}

function makeRunner(db: unknown): SentinelRunner {
  return new SentinelRunner({} as unknown as CronScheduler, db);
}

/** 契约文件写到 tmp + SYNOVA_DB_PATH 指向同目录（loadConfig().dbPath → dirname 全真链路） */
function writeContractFile(dir: string, contract: Record<string, unknown>): void {
  writeFileSync(join(dir, 'monitoring-contract.json'), JSON.stringify(contract), 'utf-8');
}

function validContract(): Record<string, unknown> {
  return {
    schema_version: 1,
    org_id: 'default',
    updated_at: '2026-09-13T06:30:00.000Z',
    updated_by: 'boss',
    metrics: [
      {
        sentinel_id: 'cash-runway',
        channels: ['electron', 'email'],
        cadence: 'daily',
      },
    ],
  };
}

/** 状态表手插行（升级队列场景构造） */
function insertStateRow(db: Database.Database, over: Record<string, unknown> = {}): void {
  db.prepare(
    `INSERT OR REPLACE INTO sentinel_notification_state
     (signal_id, sentinel_id, first_notified_ms, last_notified_ms, last_notified_severity, entities, notified_count, reminded_at_ms, front_page_at_ms, resolved_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    over.signal_id ?? 'sig_teamA',
    over.sentinel_id ?? 'sentinel-cash-runway',
    over.first_notified_ms ?? T0.getTime() - HOUR_MS,
    over.last_notified_ms ?? T0.getTime() - HOUR_MS,
    over.last_notified_severity ?? 'critical',
    over.entities ?? '[]',
    over.notified_count ?? 1,
    over.reminded_at_ms ?? null,
    over.front_page_at_ms ?? null,
    over.resolved_at_ms ?? null,
  );
}

function insertTicketRow(db: Database.Database, over: { id?: string; status?: string; createdAt?: string; signalId?: string } = {}): void {
  db.prepare(
    `INSERT OR REPLACE INTO sentinel_tickets (id, signal_id, severity, expert_type, diagnosis, suggested_actions, status, created_at, resolved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    over.id ?? 'ticket-sig_teamA-auto',
    over.signalId ?? 'sig_teamA',
    'critical',
    'auto',
    JSON.stringify({ title: '现金流危急', summary: '', evidence: [], auto: true }),
    null,
    over.status ?? 'open',
    over.createdAt ?? '2026-09-13 09:00:00',
    null,
  );
}

// ═══ 共享环境: tmp 契约目录 + email 假适配器（渠道合法集） ═══

let tmpDir: string;
const PREV_DB_PATH = process.env.SYNOVA_DB_PATH;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'd716-wiring-'));
  process.env.SYNOVA_DB_PATH = join(tmpDir, 'synova.db');
  clearMonitoringContractCache();
  registerNotificationAdapter(emailAdapter); // 'email' 进合法渠道集（契约校验）
  destroySentinelRegistry();
  dispatchNotificationMock.mockClear();
  logMock.warn.mockClear();
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  if (PREV_DB_PATH === undefined) delete process.env.SYNOVA_DB_PATH;
  else process.env.SYNOVA_DB_PATH = PREV_DB_PATH;
  clearMonitoringContractCache();
  unregisterNotificationAdapter('email');
  setGlobalSentinelRunner(null);
});

/** 全链路驱动: 注册哨兵 → runOnce → aggregateAndDispatch（先例: dedup-key-stability） */
async function primeOneDispatch(runner: SentinelRunner): Promise<void> {
  getSentinelRegistry().register(makeSentinel('sentinel-cash-runway', [makeFinding()]));
  await runner.runOnce('sentinel-cash-runway');
  await runner.aggregateAndDispatch();
}

// ═══ T7 + T9: 契约渠道真实影响派发 + 状态表落账 ═══

describe('D716 T7/T9 — 聚合派发走 decideNotification + 契约 channels 影响派发目标 + 状态表落账', () => {
  let db: Database.Database;
  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(TICKET_DDL);
    createNotificationStateTable(db);
    writeContractFile(tmpDir, validContract());
  });
  afterEach(() => { db.close(); });

  it('T7: 契约声明 [electron, email] → dispatchNotification 按渠道各派发一次（targetSystem 真实传递）', async () => {
    const runner = makeRunner(db);
    setGlobalSentinelRunner(runner);
    await primeOneDispatch(runner);

    expect(dispatchNotificationMock).toHaveBeenCalledTimes(2);
    const targets = dispatchNotificationMock.mock.calls.map((c) => (c[0] as { targetSystem: string }).targetSystem).sort();
    expect(targets).toEqual(['electron', 'email']);
  });

  it('T7: 首次派发 id 稳定（notif-${signal.id}, D354 契约不回退）', async () => {
    const runner = makeRunner(db);
    setGlobalSentinelRunner(runner);
    await primeOneDispatch(runner);
    const ids = dispatchNotificationMock.mock.calls.map((c) => (c[0] as { id: string }).id);
    expect(ids.every((id) => id === 'notif-sig_团队A')).toBe(true);
  });

  it('T9: 派发后 sentinel_notification_state 有行 + last_notified_severity=critical + signal_id 对齐', async () => {
    const runner = makeRunner(db);
    setGlobalSentinelRunner(runner);
    await primeOneDispatch(runner);

    const rows = db.prepare('SELECT * FROM sentinel_notification_state').all() as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0].signal_id).toBe('sig_团队A');
    expect(rows[0].sentinel_id).toBe('sentinel-cash-runway');
    expect(rows[0].last_notified_severity).toBe('critical');
    expect(rows[0].notified_count).toBe(1);
    expect(rows[0].reminded_at_ms).toBeNull(); // 首日不提醒
  });

  it('T9 传导: 第二轮聚合（同 signal 无变化）→ silent → 不再派发（状态驱动核心语义）', async () => {
    const runner = makeRunner(db);
    setGlobalSentinelRunner(runner);
    await primeOneDispatch(runner);
    expect(dispatchNotificationMock).toHaveBeenCalledTimes(2); // 首轮两渠道

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(T0.getTime() + 6 * HOUR_MS)); // 6h 后（超抖动窗, 未到 24h）
    try {
      await primeOneDispatch(runner);
    } finally {
      vi.useRealTimers();
    }
    expect(dispatchNotificationMock).toHaveBeenCalledTimes(2); // 无变化不重发（D-1 六态行 2）
  });
});

// ═══ T8: resolveThresholds 契约优先 ═══

describe('D716 T8 — resolveThresholds 契约层: 契约 > memStore > manifest', () => {
  /** 注入式契约（deps.contractLoader — 不碰真实 data/） */
  function contractWithThresholds(sentinelId: string, warning: number, critical: number): () => EffectiveContract {
    const c = loadMonitoringContract({
      dataDir: tmpDir,
      orgId: 'default',
      statMtimeMs: () => 1,
      readFile: () => JSON.stringify({
        schema_version: 1, org_id: 'default',
        updated_at: '2026-09-13T06:30:00.000Z', updated_by: 'boss',
        metrics: [{ sentinel_id: sentinelId, thresholds: { warning, critical } }],
      }),
      availableChannels: () => ['electron', 'weekly_report'],
    });
    return () => c;
  }

  function memStoreWith(warning: number, critical: number): { recall(orgId: string, key: string): { value: string } | null } {
    return {
      recall: (_org: string, key: string) =>
        key.includes('customer-demand-shift')
          ? { value: JSON.stringify({ newThreshold: { warning, critical } }) }
          : null,
    };
  }

  it('契约命中 + memStore 也有覆写 → 契约胜（声明式 > 运行期微调, spec §5.4 决策 4）', async () => {
    const r = await resolveThresholds('customer-demand-shift', 'org-a', {
      memoryStore: memStoreWith(0.3, 0.35),
      contractLoader: contractWithThresholds('customer-demand-shift', 0.5, 0.9),
    });
    expect(r.thresholds.churn_rate).toEqual({ warning: 0.5, critical: 0.9 }); // 契约值
    expect(r.overrideApplied).toBe(true);
  });

  it('契约无该哨兵条目 → 回落 memStore 覆写（旧链零回归）', async () => {
    const emptyContract = loadMonitoringContract({
      dataDir: tmpDir, orgId: 'default',
      statMtimeMs: () => null, // ENOENT → 全默认（bySentinel 空）
      readFile: () => { throw new Error('ENOENT'); },
    });
    const r = await resolveThresholds('customer-demand-shift', 'org-a', {
      memoryStore: memStoreWith(0.3, 0.35),
      contractLoader: () => emptyContract,
    });
    expect(r.thresholds.churn_rate).toEqual({ warning: 0.3, critical: 0.35 }); // memStore 生效
    expect(r.overrideApplied).toBe(true);
  });

  it('契约与 memStore 皆无 → manifest 基线（逐条等价旧行为）', async () => {
    const emptyContract = loadMonitoringContract({
      dataDir: tmpDir, orgId: 'default',
      statMtimeMs: () => null,
      readFile: () => { throw new Error('ENOENT'); },
    });
    const r = await resolveThresholds('customer-demand-shift', 'org-a', {
      memoryStore: { recall: () => null },
      contractLoader: () => emptyContract,
    });
    expect(r.thresholds.churn_rate).toEqual({ warning: 0.1, critical: 0.2 }); // manifest 基线
    expect(r.overrideApplied).toBe(false);
  });

  it('契约 loader 抛错 → log.warn + 回落旧链（降级不静默, 铁律 24）', async () => {
    const r = await resolveThresholds('customer-demand-shift', 'org-a', {
      memoryStore: { recall: () => null },
      contractLoader: () => { throw new Error('contract fs broken'); },
    });
    expect(r.thresholds.churn_rate).toEqual({ warning: 0.1, critical: 0.2 }); // manifest 兜底
    expect(logMock.warn.mock.calls.some((c) => JSON.stringify(c).includes('contract'))).toBe(true);
  });
});

// ═══ T10 + T11: 状态表读/写失败降级 ═══

describe('D716 T10/T11 — 状态表读/写失败 → 宁可多发不吞真告警', () => {
  it('T10: 表缺失 → readNotificationState 返回 null + 决策按首次 → 派发仍发生', async () => {
    const db = new Database(':memory:');
    db.exec(TICKET_DDL); // 只建工单表, 无状态表
    writeContractFile(tmpDir, validContract());
    try {
      expect(readNotificationState(db, 'sig_teamA')).toBeNull();

      const runner = makeRunner(db);
      setGlobalSentinelRunner(runner);
      await primeOneDispatch(runner);
      expect(dispatchNotificationMock).toHaveBeenCalledTimes(2); // 首次语义, 不吞
      expect(logMock.warn.mock.calls.some((c) => JSON.stringify(c).includes('sentinel_notification_state'))).toBe(true);
    } finally {
      db.close();
    }
  });

  it('T11: 状态表写入失败（DROP 后）→ 派发不被阻断 + log.warn 非静默', async () => {
    const db = new Database(':memory:');
    db.exec(TICKET_DDL);
    createNotificationStateTable(db);
    db.exec('DROP TABLE sentinel_notification_state'); // 模拟写入失败（no such table）
    writeContractFile(tmpDir, validContract());
    try {
      const runner = makeRunner(db);
      setGlobalSentinelRunner(runner);
      await primeOneDispatch(runner);

      expect(dispatchNotificationMock).toHaveBeenCalledTimes(2); // 派发未被阻断
      expect(logMock.warn.mock.calls.some((c) => JSON.stringify(c).includes('sentinel_notification_state'))).toBe(true);
    } finally {
      db.close();
    }
  });
});

// ═══ T12: 契约 degraded 传播 ═══

describe('D716 T12 — 契约 degraded 传播: 决策仍产出动作 + 调用方日志含原因', () => {
  it('org_id 不匹配契约 → 派发仍发生（默认契约渠道 electron）+ log.warn 含 org_id 原因', async () => {
    const db = new Database(':memory:');
    db.exec(TICKET_DDL);
    createNotificationStateTable(db);
    writeContractFile(tmpDir, { ...validContract(), org_id: 'other-org' }); // 串客户守卫触发
    try {
      const runner = makeRunner(db);
      setGlobalSentinelRunner(runner);
      await primeOneDispatch(runner);

      // 决策仍产出动作（degraded 不阻断通知 — 宁可发不可吞）
      expect(dispatchNotificationMock).toHaveBeenCalledTimes(1);
      expect((dispatchNotificationMock.mock.calls[0][0] as { targetSystem: string }).targetSystem).toBe('electron'); // 回落默认渠道
      // 调用方日志含 degraded 原因（铁律 31 传播）
      expect(logMock.warn.mock.calls.some((c) => JSON.stringify(c).includes('org_id'))).toBe(true);
    } finally {
      db.close();
    }
  });
});

// ═══ EQ: 升级队列读接口（DS8, Mac → Win 唯一接口面） ═══

describe('D716 EQ — listEscalationQueue: 未回应/停滞清单（spec §5.2-F）', () => {
  let db: Database.Database;
  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(TICKET_DDL);
    createNotificationStateTable(db);
  });
  afterEach(() => { db.close(); });

  it('停滞场景: 工单 open + created 9 天前 + 已提醒过 → 队列含 stalled 项（stalledDays=9）', () => {
    const now = T0.getTime() + 9 * DAY_MS;
    const created = new Date(T0.getTime()).toISOString().replace('T', ' ').slice(0, 19);
    insertTicketRow(db, { status: 'open', createdAt: created });
    insertStateRow(db, {
      first_notified_ms: T0.getTime(),
      last_notified_ms: T0.getTime(),
      reminded_at_ms: T0.getTime() + DAY_MS, // 已提醒（8 天前）→ 不与 no_response 抢占
    });

    const runner = makeRunner(db);
    const queue = runner.listEscalationQueue({ nowMs: now });
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      signalId: 'sig_teamA',
      sentinelId: 'sentinel-cash-runway',
      ticketStatus: 'open',
      reason: 'stalled',
      stalledDays: 9,
    });
    expect(queue[0].channels).toEqual(['electron']); // 无契约文件 → 默认渠道
    expect(queue[0].format).toBe('one_pager');
  });

  it('未回应场景: 30h 未回应 + 未提醒 → 队列含 no_response 项', () => {
    const now = T0.getTime() + 30 * HOUR_MS;
    insertTicketRow(db, { status: 'open', createdAt: new Date(T0.getTime() - HOUR_MS).toISOString().replace('T', ' ').slice(0, 19) });
    insertStateRow(db, {
      first_notified_ms: T0.getTime() - HOUR_MS,
      last_notified_ms: T0.getTime() - HOUR_MS,
    });

    const runner = makeRunner(db);
    const queue = runner.listEscalationQueue({ nowMs: now });
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ reason: 'no_response', ticketStatus: 'open' });
  });

  it('边界: 已解决工单 + 新近通知 → 空队列; 空表 → []', () => {
    insertTicketRow(db, { status: 'resolved' });
    insertStateRow(db, { first_notified_ms: T0.getTime(), last_notified_ms: T0.getTime() });
    const runner = makeRunner(db);
    expect(runner.listEscalationQueue({ nowMs: T0.getTime() + HOUR_MS })).toEqual([]);
  });

  it('表不存在 → 抛出（L3 不吞错, 与 listSentinelTickets 同口径 — spec §5.2-F @error）', () => {
    const bare = new Database(':memory:');
    try {
      const runner = makeRunner(bare);
      expect(() => runner.listEscalationQueue({ nowMs: T0.getTime() })).toThrow();
    } finally {
      bare.close();
    }
  });
});
