/**
 * orchestrator/event-store.ts — 不可变事件日志 (SQLite) (Iter 1)
 *
 * Event Sourcing: 所有状态变更 = 追加写入事件。
 * 永不更新、永不物理删除。崩溃恢复 = 重放事件日志。
 */
import Database from 'better-sqlite3';
import type { OrchestrationEvent, EventFilter } from './types';

export class EventStore {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS orchestration_events (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        consultation_id TEXT NOT NULL,
        phase INTEGER,
        data TEXT NOT NULL DEFAULT '{}',
        trace_id TEXT NOT NULL,
        span_id TEXT NOT NULL,
        parent_span_id TEXT,
        timestamp TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_oe_consultation ON orchestration_events(consultation_id);
      CREATE INDEX IF NOT EXISTS idx_oe_type ON orchestration_events(type);
      CREATE INDEX IF NOT EXISTS idx_oe_timestamp ON orchestration_events(timestamp);
    `);
  }

  /** Append an event (immutable — only INSERT, never UPDATE/DELETE) */
  append(event: OrchestrationEvent): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO orchestration_events
        (id, type, consultation_id, phase, data, trace_id, span_id, parent_span_id, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.id, event.type, event.consultationId,
      event.phase ?? null,
      JSON.stringify(event.data),
      event.traceId, event.spanId,
      event.parentSpanId ?? null,
      event.timestamp,
    );
  }

  /** Query events by filter */
  query(filter: EventFilter = {}): OrchestrationEvent[] {
    const conditions: string[] = ['1=1'];
    const params: unknown[] = [];

    if (filter.consultationId) { conditions.push('consultation_id = ?'); params.push(filter.consultationId); }
    if (filter.type) { conditions.push('type = ?'); params.push(filter.type); }
    if (filter.phase !== undefined) { conditions.push('phase = ?'); params.push(filter.phase); }
    if (filter.fromTimestamp) { conditions.push('timestamp >= ?'); params.push(filter.fromTimestamp); }

    const sql = `SELECT * FROM orchestration_events WHERE ${conditions.join(' AND ')} ORDER BY timestamp ASC` +
      (filter.limit ? ` LIMIT ${filter.limit}` : '');

    const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    return rows.map(r => ({
      id: r.id as string,
      type: r.type as string,
      consultationId: r.consultation_id as string,
      phase: r.phase as number | undefined,
      data: JSON.parse(r.data as string),
      traceId: r.trace_id as string,
      spanId: r.span_id as string,
      parentSpanId: r.parent_span_id as string | undefined,
      timestamp: r.timestamp as string,
    }));
  }

  /** Replay all events for a consultation (crash recovery) */
  replay(consultationId: string): OrchestrationEvent[] {
    return this.query({ consultationId });
  }
}
