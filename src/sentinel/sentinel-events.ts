/**
 * sentinel/sentinel-events.ts — 哨兵事件存储 (L5, append-only)
 *
 * 事件溯源（Event Sourcing）L5 存储抽象。`sentinel_events` 表是哨兵
 * finding/signal/ticket 状态迁移的**唯一写入口**（I2 单源）；runner 内存
 * `records` Map 降级为事件流物化投影（启动重放重建，I1 可重建）；任一
 * finding 可经 `aggregate_id` 追溯其产生 run（I3 可审计）。
 *
 * 三条 invariant（K3 定）:
 *   I1 可重建 — kill -9 后重启，事件流重放重建状态与崩溃前等价
 *   I2 单源   — 状态只有 `appendSentinelEvent` 一个写入口，读路径全部从投影派生
 *   I3 可审计 — 任一 finding 能从事件流回答「由哪些输入事件产生」
 *
 * 参考: orchestrator/event-store.ts（append-only 模式复用，独立表）
 *
 * @state: real — L5 事件存储抽象
 */

import type Database from 'better-sqlite3';
import { createLogger } from '@synova/logger';

const log = createLogger('sentinel/sentinel-events');

// ═══ Types ═══

/** 哨兵事件类型（append-only，永不 UPDATE/DELETE） */
export type SentinelEventType =
  | 'run_completed'      // 一次哨兵 run 完成（聚合锚点）
  | 'finding'            // 单条 finding（finding 级事件，I3 可审计）
  | 'finding_transition' // finding 生命周期迁移（open→acknowledged→resolved）
  | 'signal'             // 聚合信号（I3 审计）
  | 'ticket_transition'; // 工单状态迁移（I3 审计）

/** 待写入事件（调用方构造） */
export interface SentinelEventInput {
  event_type: SentinelEventType;
  sentinel_id: string;
  /** I3: finding 追溯其 run（= `${sentinelId}@${checkedAt}`）；finding_transition 用 finding.id */
  aggregate_id?: string;
  /** JSON 可序列化 payload（完整对象，不含 L3 原始数据） */
  payload: Record<string, unknown>;
}

/** 已落库事件行（重放返回） */
export interface SentinelEventRow {
  seq: number;
  event_type: SentinelEventType;
  sentinel_id: string;
  aggregate_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

/** 哨兵事件错误（铁律 32: .code + .phase + .retryable） */
export class SentinelsEventError extends Error {
  readonly code: string;
  readonly phase: string;
  readonly retryable: boolean;

  constructor(
    message: string,
    code = 'SENTINEL_EVENT_ERROR',
    phase = 'persist',
    retryable = true,
  ) {
    super(message);
    this.name = 'SentinelsEventError';
    this.code = code;
    this.phase = phase;
    this.retryable = retryable;
  }
}

// ═══ Schema ═══

const EVENT_TYPES = ['run_completed', 'finding', 'finding_transition', 'signal', 'ticket_transition'];

/**
 * createSentinelEventsTable — 建 `sentinel_events` append-only 表（幂等）。
 * 契约:
 *   @input  — db: Database.Database
 *   @output — void（表不存在则创建，存在则 no-op）
 *   @degraded — 建表失败 → log.error + 抛 SentinelsEventError(.phase='persist')
 *   @error  — db 不可用 → fail-closed 抛错（不静默）
 */
export function createSentinelEventsTable(db: Database.Database): void {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS sentinel_events (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL CHECK(event_type IN ('${EVENT_TYPES.join("','")}')),
        sentinel_id TEXT NOT NULL,
        aggregate_id TEXT,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_sentinel_events_seq ON sentinel_events(seq);
      CREATE INDEX IF NOT EXISTS idx_sentinel_events_type ON sentinel_events(event_type, sentinel_id);
    `);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new SentinelsEventError(
      `sentinel_events 建表失败: ${msg}`,
      'SENTINEL_EVENT_TABLE_ERROR',
      'persist',
      true,
    );
  }
}

/**
 * appendSentinelEvent — 追加一条事件（I2 单源：唯一写入口）。
 * 契约:
 *   @input  — db: Database.Database, event: SentinelEventInput
 *   @output — void（追加一行，seq 由 AUTOINCREMENT 单调分配）
 *   @degraded — 写入失败 → 抛 SentinelsEventError(.code/.phase='persist'/.retryable=true)
 *   @error  — 表不存在 → 幂等建表后重试一次；db 不可用 → fail-closed 抛错（不静默）
 */
export function appendSentinelEvent(db: Database.Database, event: SentinelEventInput): void {
  try {
    _append(db, event);
  } catch (err: unknown) {
    // 表可能未建（如 runner 未 start）→ 幂等建表后重试一次
    const msg = err instanceof Error ? err.message : String(err);
    if (/no such table/i.test(msg)) {
      try {
        createSentinelEventsTable(db);
        _append(db, event);
        return;
      } catch (retryErr: unknown) {
        const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
        throw new SentinelsEventError(
          `sentinel_events 追加失败（建表重试后仍失败）: ${retryMsg}`,
          'SENTINEL_EVENT_APPEND_ERROR',
          'persist',
          true,
        );
      }
    }
    throw new SentinelsEventError(
      `sentinel_events 追加失败: ${msg}`,
      'SENTINEL_EVENT_APPEND_ERROR',
      'persist',
      true,
    );
  }
}

function _append(db: Database.Database, event: SentinelEventInput): void {
  db.prepare(
    `INSERT INTO sentinel_events (event_type, sentinel_id, aggregate_id, payload)
     VALUES (?, ?, ?, ?)`
  ).run(
    event.event_type,
    event.sentinel_id,
    event.aggregate_id ?? null,
    JSON.stringify(event.payload),
  );
}

/**
 * replaySentinelEvents — 按 seq 升序重放全部事件（I1 可重建）。
 * 契约:
 *   @input  — db: Database.Database
 *   @output — SentinelEventRow[]（seq 升序；空表 → []）
 *   @degraded — 读取失败 → 抛 SentinelsEventError(.phase='replay')
 *   @error  — payload JSON 解析失败 → log.warn + 跳过该行（不静默，不中断整体重放）
 */
export function replaySentinelEvents(db: Database.Database): SentinelEventRow[] {
  let rows: Array<Record<string, unknown>>;
  try {
    rows = db.prepare(
      `SELECT seq, event_type, sentinel_id, aggregate_id, payload, created_at
       FROM sentinel_events ORDER BY seq ASC`
    ).all() as Array<Record<string, unknown>>;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new SentinelsEventError(
      `sentinel_events 重放失败: ${msg}`,
      'SENTINEL_EVENT_REPLAY_ERROR',
      'replay',
      true,
    );
  }

  const out: SentinelEventRow[] = [];
  for (const r of rows) {
    const rawPayload = r.payload as string;
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawPayload) as Record<string, unknown>;
    } catch {
      // 铁律 24: JSON.parse 失败 → log.warn（不静默）——跳过损坏行，不中断整体重放
      log.warn({ seq: r.seq }, '[sentinel-events] 事件 payload JSON 损坏 — 跳过该行');
      continue;
    }
    out.push({
      seq: Number(r.seq),
      event_type: r.event_type as SentinelEventType,
      sentinel_id: r.sentinel_id as string,
      aggregate_id: r.aggregate_id as string | null,
      payload,
      created_at: r.created_at as string,
    });
  }
  return out;
}
