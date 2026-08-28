/**
 * tests/sentinel/sentinel-events-contract.test.ts — D546 双线公共契约冻结测试（DS2）
 *
 * 契约来源: docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D546-sentinel-findings-event-20260828.md §8.1
 *   C1 流序号     — 流内单调整数（粒度差异如实记录: sentinel 全局 seq vs session 会话内 seq）
 *   C2 事件类型   — 声明式枚举 + 命名空间分域（sentinel 域归 Mac 片1，diagnosis 与 session
 *                   域归 Win 片2-A D487，两线互不占用对方法定名）
 *   C3 聚合标识   — aggregate_id 可选，存在即须可追溯（I3: finding → run_completed）
 *   C4 载荷       — 语义名统一 payload（JSON 对象，camelCase）；列名差异（payload/payload_json）
 *                   为存储细节，映射显式
 *   C5 行时间戳   — created_at 同源 SQLite datetime('now')（'YYYY-MM-DD HH:MM:SS' UTC）
 *   C6 时间戳条款 — payload 内一切时间戳字段一律 ISO 8601 UTC 字符串；禁止数值型纪元值、
 *                   禁止 duration 值充当时间戳（K3「恒 1970」缺陷的制度化防线，核心条款）
 *   C7 写失败语义 — sentinel 线 throw fail-closed（SentinelsEventError，铁律 32）/ session 线
 *                   返回 {ok:false, degraded:true}（铁律 31）——两线各自成立，跨线消费方同时容忍
 *
 * red 语义（S-5 诚实 red）: 实现在位（D394 片1 a8a5857e，K3 审计 PASS），本测试冻结契约；
 *   red 用故障注入证明网有效——喂「durationMs 冒充 checkedAt」的违约 payload → C6 断言必须 throw。
 *
 * 覆盖（3 用例，铁律 48 非空壳）:
 *   ① findings 事件信封 ⊆ 公共契约 C1-C6（经 executeSentinel 生产路径产生真实事件）
 *   ② S-5 故障注入 red: 违约 payload（checkedAt/detectedAt = new Date(durationMs)）→ C6 必须 throw
 *   ③ 双线信封映射同构: sentinel_events 行与 session_events 行映射到公共信封 → 同构 + C7 双形态
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  createSentinelEventsTable,
  appendSentinelEvent,
  replaySentinelEvents,
  SentinelsEventError,
  type SentinelEventRow,
} from '../../src/sentinel/sentinel-events';
import { SentinelRunner, setGlobalSentinelRunner } from '../../src/sentinel/runner';
import { getSentinelRegistry, destroySentinelRegistry } from '../../src/sentinel/registry';
import { SessionStore } from '../../src/store/session-store';
import { CronScheduler } from '../../src/cron/scheduler';
import type { SentinelCheckResult, SentinelFinding, SentinelConfig } from '../../src/sentinel/types';

// ═══ 公共契约常量（D546 spec §8.1） ═══

const SENTINEL_EVENT_TYPES: readonly string[] = ['run_completed', 'finding', 'finding_transition', 'signal', 'ticket_transition'];
const SESSION_EVENT_TYPES: readonly string[] = ['message', 'tool_result', 'system'];

/** C5: 行时间戳 = SQLite datetime('now') 格式（两线同源） */
const CREATED_AT_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
/** C6: payload 内时间戳字段 = ISO 8601 UTC 字符串 */
const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

/** 双线公共信封（spec §8.2①: 两线事件行映射到同一组语义字段） */
interface CommonEnvelope {
  stream: 'sentinel_events' | 'session_events';
  seq: number;
  eventType: string;
  aggregateId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

/**
 * assertIsoUtcTimestamp — C6 条款断言器（跨线共享）。
 * 时间戳字段必须为 ISO 8601 UTC 字符串，且年份 ≥ 2026（纪元防护——
 * 「数值当时间戳」缺陷的表征 = 年份 1970；duration 值冒充的时间戳仍是合法 ISO，
 * 唯有年份防护能抓住，故两者缺一不可）。违约 → throw（测试红 = 网有效）。
 */
function assertIsoUtcTimestamp(value: unknown, field: string): void {
  if (typeof value !== 'string' || !ISO_UTC_RE.test(value)) {
    throw new Error(
      `[C6 违约] ${field} 必须为 ISO 8601 UTC 字符串，实得 ${JSON.stringify(value) ?? String(value)}（${typeof value}）`
    );
  }
  const year = new Date(value).getFullYear();
  if (!Number.isFinite(year) || year < 2026) {
    throw new Error(
      `[C6 违约] ${field} 年份 ${year} < 2026 —— duration/纪元值冒充时间戳（K3 §4.6「恒 1970」缺陷形态）`
    );
  }
}

/**
 * assertCommonEnvelope — C1/C2/C3/C4/C5 信封断言器（跨线共享）。
 * 断言任一线的事件行映射到公共信封后满足流序号/枚举分域/聚合标识/载荷/行时间戳条款。
 */
function assertCommonEnvelope(env: CommonEnvelope): void {
  // C1: 流内单调整数
  if (!Number.isInteger(env.seq) || env.seq <= 0) {
    throw new Error(`[C1 违约] ${env.stream} seq 必须为正整数，实得 ${String(env.seq)}`);
  }
  // C2: 声明式枚举 + 命名空间分域（两线互不占用对方法定名）
  if (env.stream === 'sentinel_events') {
    if (!SENTINEL_EVENT_TYPES.includes(env.eventType)) {
      throw new Error(`[C2 违约] sentinel_events 枚举外事件类型: ${env.eventType}`);
    }
    if (SESSION_EVENT_TYPES.includes(env.eventType)) {
      throw new Error(`[C2 违约] sentinel 线占用 session 域定名: ${env.eventType}`);
    }
  } else {
    if (!SESSION_EVENT_TYPES.includes(env.eventType)) {
      throw new Error(`[C2 违约] session_events 枚举外事件类型: ${env.eventType}`);
    }
    if (SENTINEL_EVENT_TYPES.includes(env.eventType)) {
      throw new Error(`[C2 违约] session 线占用 sentinel 域定名: ${env.eventType}`);
    }
  }
  // C3: aggregate_id 可选，存在即须为字符串（可追溯性由用例①的 I3 断言验证）
  if (env.aggregateId !== null && typeof env.aggregateId !== 'string') {
    throw new Error(`[C3 违约] aggregate_id 必须为 string | null，实得 ${typeof env.aggregateId}`);
  }
  // C4: 载荷为 JSON 对象（camelCase 语义键由各事件形态断言）
  if (env.payload === null || typeof env.payload !== 'object' || Array.isArray(env.payload)) {
    throw new Error(`[C4 违约] payload 必须为 JSON 对象，实得 ${typeof env.payload}`);
  }
  // C5: 行时间戳同源格式
  if (typeof env.createdAt !== 'string' || !CREATED_AT_RE.test(env.createdAt)) {
    throw new Error(`[C5 违约] createdAt 必须为 'YYYY-MM-DD HH:MM:SS' UTC，实得 ${String(env.createdAt)}`);
  }
}

/** C6（run_completed 形态）: checkedAt 为 ISO UTC 时间戳 + durationMs 为 duration 语义（非负数值） */
function assertRunCompletedTimestamps(payload: Record<string, unknown>): void {
  assertIsoUtcTimestamp(payload.checkedAt, 'run_completed.payload.checkedAt');
  if (typeof payload.durationMs !== 'number' || !Number.isFinite(payload.durationMs) || payload.durationMs < 0) {
    throw new Error(
      `[C6 违约] run_completed.payload.durationMs 必须为非负有限数值（duration 语义，毫秒数），实得 ${String(payload.durationMs)}`
    );
  }
}

/** C6（finding 形态）: finding.detectedAt 为 ISO UTC 时间戳 */
function assertFindingTimestamps(payload: Record<string, unknown>): void {
  const finding = payload.finding as Record<string, unknown> | undefined;
  if (!finding || typeof finding !== 'object' || Array.isArray(finding)) {
    throw new Error('[C4 违约] finding.payload.finding 缺失或非对象');
  }
  assertIsoUtcTimestamp(finding.detectedAt, 'finding.payload.finding.detectedAt');
}

/** SentinelEventRow → 公共信封映射（spec §8.1「映射显式」） */
function toEnvelope(row: SentinelEventRow): CommonEnvelope {
  return {
    stream: 'sentinel_events',
    seq: row.seq,
    eventType: row.event_type,
    aggregateId: row.aggregate_id,
    payload: row.payload,
    createdAt: row.created_at,
  };
}

// ═══ Fixtures ═══

const CHECKED_AT = '2026-08-28T10:00:00.000Z';

function makeFinding(overrides: Partial<SentinelFinding> = {}): SentinelFinding {
  return {
    id: 'f1',
    severity: 'warning',
    title: '契约测试发现',
    description: 'D546 DS2 契约测试 fixture',
    evidence: [],
    suggestion: '建议',
    detectedAt: CHECKED_AT,
    ...overrides,
  };
}

const CONTRACT_CONFIG: SentinelConfig = {
  id: 'contract-s1',
  name: '契约哨兵',
  description: 'D546 DS2 契约测试',
  category: 'growth',
  priority: 'P1',
  mode: 'on-demand',
  version: '1',
  requiredDataSources: [],
};

function contractCheck(id: string, findingId: string): () => Promise<SentinelCheckResult> {
  return async (): Promise<SentinelCheckResult> => ({
    sentinelId: id,
    ok: true,
    findings: [makeFinding({ id: findingId })],
    durationMs: 12,
    checkedAt: CHECKED_AT,
    degraded: false,
  });
}

// ═══ Setup ═══

let db: Database.Database;
let scheduler: CronScheduler;
let runner: SentinelRunner;

beforeEach(() => {
  db = new Database(':memory:');
  scheduler = new CronScheduler(db);
  runner = new SentinelRunner(scheduler, db);
  createSentinelEventsTable(db);
});

afterEach(() => {
  setGlobalSentinelRunner(null);
  destroySentinelRegistry();
  scheduler.stop();
  db.close();
});

// ═══ Tests ═══

describe('D546 DS2: 双线公共契约冻结（spec §8.1 C1-C7）', () => {
  it('① findings 事件信封 ⊆ 公共契约 C1-C6（经 executeSentinel 生产路径产生真实事件）', async () => {
    const registry = getSentinelRegistry();
    registry.register({ config: CONTRACT_CONFIG, check: contractCheck('contract-s1', 'f-contract') });

    const result = await runner.runOnce('contract-s1');
    expect(result).not.toBeNull();

    const rows = replaySentinelEvents(db);
    const runRow = rows.find(r => r.event_type === 'run_completed');
    const findingRow = rows.find(r => r.event_type === 'finding');
    expect(runRow).toBeDefined();
    expect(findingRow).toBeDefined();

    // C1: 流内单调整数（全流 seq 严格升序）
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].seq).toBeGreaterThan(rows[i - 1].seq);
    }

    const runEnv = toEnvelope(runRow!);
    const findingEnv = toEnvelope(findingRow!);

    // 信封断言器对真实生产事件全绿
    expect(() => assertCommonEnvelope(runEnv)).not.toThrow();
    expect(() => assertCommonEnvelope(findingEnv)).not.toThrow();

    // C2: 命名空间分域——sentinel 域不占用 session 域定名
    for (const t of SENTINEL_EVENT_TYPES) {
      expect(SESSION_EVENT_TYPES).not.toContain(t);
      expect(t.startsWith('diagnosis_')).toBe(false);
    }

    // C3: 聚合标识可追溯（I3: finding → 同 runKey 的 run_completed，seq 链有序）
    expect(runEnv.aggregateId).toBe(`contract-s1@${CHECKED_AT}`);
    expect(findingEnv.aggregateId).toBe(runEnv.aggregateId);
    expect(findingEnv.seq).toBeGreaterThan(runEnv.seq);

    // C4: 载荷语义字段冻结（persistRunEvents L716-738 形态——防两线信封漂移的核心锚点）
    expect(Object.keys(runEnv.payload).sort()).toEqual(
      ['checkedAt', 'cronJobId', 'degraded', 'durationMs', 'error', 'ok', 'sentinelId', 'sentinelName']
    );
    expect(Object.keys(findingEnv.payload).sort()).toEqual(['finding']);
    const findingObj = findingEnv.payload.finding as Record<string, unknown>;
    expect(Object.keys(findingObj)).toEqual(
      expect.arrayContaining(['id', 'severity', 'title', 'description', 'evidence', 'suggestion', 'detectedAt', 'status'])
    );
    expect(findingObj.status).toBe('open'); // 生产路径默认生命周期（runner L1085-1087）

    // C5: 行时间戳同源格式
    expect(runEnv.createdAt).toMatch(CREATED_AT_RE);
    expect(findingEnv.createdAt).toMatch(CREATED_AT_RE);

    // C6: payload 时间戳字段一律 ISO 8601 UTC；durationMs 为 duration 语义（非负数值）
    expect(() => assertRunCompletedTimestamps(runEnv.payload)).not.toThrow();
    expect(() => assertFindingTimestamps(findingEnv.payload)).not.toThrow();
    expect(typeof runEnv.payload.durationMs).toBe('number');
    expect(runEnv.payload.durationMs as number).toBeGreaterThanOrEqual(0);
  });

  it('② S-5 故障注入 red: durationMs 冒充 checkedAt 的违约 payload → C6 断言必须 throw', () => {
    // 历史缺陷形态（K3 §4.6，sentinel-service.ts:97 修复前）: checkedAt = new Date(durationMs).toISOString()
    const violating = new Date(15).toISOString(); // '1970-01-01T00:00:00.015Z'
    expect(violating).toMatch(ISO_UTC_RE); // 违约值本身是合法 ISO——证明抓它的是纪元年份防护，不是格式防护

    const violatingDb = new Database(':memory:');
    try {
      createSentinelEventsTable(violatingDb);
      appendSentinelEvent(violatingDb, {
        event_type: 'run_completed',
        sentinel_id: 'contract-violating',
        aggregate_id: `contract-violating@${violating}`,
        payload: {
          sentinelId: 'contract-violating',
          sentinelName: '违约注入',
          checkedAt: violating,
          durationMs: 15,
          ok: true,
          error: null,
          degraded: false,
          cronJobId: 'job-x',
        },
      });
      appendSentinelEvent(violatingDb, {
        event_type: 'finding',
        sentinel_id: 'contract-violating',
        aggregate_id: `contract-violating@${violating}`,
        payload: { finding: makeFinding({ id: 'f-bad', detectedAt: violating }) },
      });

      const rows = replaySentinelEvents(violatingDb);
      expect(rows).toHaveLength(2);
      const runRow = rows.find(r => r.event_type === 'run_completed');
      const findingRow = rows.find(r => r.event_type === 'finding');
      expect(runRow).toBeDefined();
      expect(findingRow).toBeDefined();

      // C6 网必须红（两处注入形态都要被抓住）:
      // run_completed 的 checkedAt = duration 冒充
      expect(() => {
        assertCommonEnvelope(toEnvelope(runRow!));
        assertRunCompletedTimestamps(runRow!.payload);
      }).toThrow(/\[C6 违约\]/);
      // finding 的 detectedAt = duration 冒充
      expect(() => {
        assertCommonEnvelope(toEnvelope(findingRow!));
        assertFindingTimestamps(findingRow!.payload);
      }).toThrow(/\[C6 违约\]/);
    } finally {
      violatingDb.close();
    }
  });

  it('③ 双线信封映射同构: sentinel_events 行与 session_events 行映射到公共信封（C1 粒度差异如实记录 + C7 双形态）', async () => {
    // ── sentinel 线: 经生产路径产生真实事件行
    const registry = getSentinelRegistry();
    registry.register({ config: { ...CONTRACT_CONFIG, id: 'contract-s2' }, check: contractCheck('contract-s2', 'f-dual') });
    const runResult = await runner.runOnce('contract-s2');
    expect(runResult).not.toBeNull();
    const sentinelRows = replaySentinelEvents(db);
    const findingRow = sentinelRows.find(r => r.event_type === 'finding');
    expect(findingRow).toBeDefined();
    const sentinelEnv = toEnvelope(findingRow!);

    // ── session 线: D500 SessionStore 产生真实事件行（Win 片2-A 复用的同一地基）
    const store = new SessionStore(db);
    const session = store.createSession('org-d546');
    const appended = store.appendEvent(session.id, 'message', {
      text: '双线契约映射',
      createdAt: new Date().toISOString(),
    });
    expect(appended.ok).toBe(true);
    const sessionRows = store.getEvents(session.id);
    expect(sessionRows).toHaveLength(1);
    const sessionRow = sessionRows[0];
    const sessionEnv: CommonEnvelope = {
      stream: 'session_events',
      seq: sessionRow.seq,
      eventType: sessionRow.eventType,
      aggregateId: null, // C3: session 线无独立聚合列（seq 链即会话内链，spec §8.1）
      payload: JSON.parse(sessionRow.payloadJson) as Record<string, unknown>,
      createdAt: sessionRow.createdAt,
    };

    // 同构: 两线信封暴露同一组语义字段（C1-C6 同名同义）
    expect(Object.keys(sessionEnv).sort()).toEqual(Object.keys(sentinelEnv).sort());

    // 同一断言器同时接受两线（C6 守卫跨线生效——Win 片2-A 落地 payload 时间戳时的制度化约束）
    expect(() => assertCommonEnvelope(sentinelEnv)).not.toThrow();
    expect(() => assertCommonEnvelope(sessionEnv)).not.toThrow();
    assertIsoUtcTimestamp((sessionEnv.payload as { createdAt: unknown }).createdAt, 'session.payload.createdAt');
    assertIsoUtcTimestamp(
      (sentinelEnv.payload as { finding: { detectedAt: unknown } }).finding.detectedAt,
      'sentinel.payload.finding.detectedAt'
    );

    // C1 粒度差异如实记录: sentinel 全流全局单调 vs session 会话内单调（per-session seq）
    const sentinelSeqs = sentinelRows.map(r => r.seq);
    expect([...sentinelSeqs].sort((a, b) => a - b)).toEqual(sentinelSeqs);
    expect(sentinelSeqs[0]).toBe(1);
    const sessionB = store.createSession('org-d546');
    const appendedB = store.appendEvent(sessionB.id, 'message', { text: '第二会话' });
    expect(appendedB.ok).toBe(true);
    expect(store.getEvents(sessionB.id)[0].seq).toBe(1); // 会话 B 首个 seq=1（非全局递增）
    expect(sessionRow.seq).toBe(1);

    // C7 双形态: sentinel 线 throw fail-closed（铁律 32: code/phase/retryable）
    const closedDb = new Database(':memory:');
    closedDb.close();
    let caught: unknown;
    try {
      appendSentinelEvent(closedDb, { event_type: 'run_completed', sentinel_id: 'x', aggregate_id: null, payload: {} });
    } catch (err: unknown) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(SentinelsEventError);
    const evErr = caught as SentinelsEventError;
    expect(evErr.code.length).toBeGreaterThan(0);
    expect(evErr.phase).toBe('persist');
    expect(evErr.retryable).toBe(true);

    // C7 双形态: session 线返回 degraded（铁律 31: 不静默、不抛）
    const degradedDb = new Database(':memory:');
    const degradedStore = new SessionStore(degradedDb);
    degradedDb.close();
    const degradedRes = degradedStore.appendEvent(session.id, 'message', { text: 'closed-db' });
    expect(degradedRes.ok).toBe(false);
    if (!degradedRes.ok) {
      expect(degradedRes.degraded).toBe(true);
      expect(typeof degradedRes.error).toBe('string');
      expect(degradedRes.error.length).toBeGreaterThan(0);
    }
  });
});
