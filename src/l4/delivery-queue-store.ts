/**
 * l4/delivery-queue-store.ts — 持久投递队列存储 (Phase 2.1)
 *
 * SQLite 持久化投递队列。支持 enqueue/dequeue/peekPending/markDelivered/markFailed。
 * 退避 + 去重 + 崩溃恢复。
 *
 * 铁律 24: 降级路径有 log.warn
 * 铁律 38: 纯类型安全
 */
import type Database from 'better-sqlite3';
import { createLogger } from '@synova/logger';

const log = createLogger('l4/delivery-queue-store');

// ═══ 类型 ═══

export type TargetType = 'notification' | 'message' | 'alert';
export type EntryStatus = 'pending' | 'delivered' | 'failed';

export interface DeliveryQueueEntry {
  id: string;
  orgId: string;
  targetType: TargetType;
  targetId: string;
  payload: string;
  status: EntryStatus;
  retryCount: number;
  maxRetries: number;
  nextRetryAt: string | null;
  createdAt: string;
  deliveredAt: string | null;
}

export interface EnqueueInput {
  orgId: string;
  targetType: TargetType;
  targetId: string;
  payload: string;
  maxRetries?: number;
}

// ═══ DeliveryQueueStore ═══

export class DeliveryQueueStore {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS delivery_queue (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        target_type TEXT NOT NULL CHECK(target_type IN ('notification','message','alert')),
        target_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','delivered','failed')),
        retry_count INTEGER NOT NULL DEFAULT 0,
        max_retries INTEGER NOT NULL DEFAULT 5,
        next_retry_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        delivered_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_dq_status ON delivery_queue(status, next_retry_at);
      CREATE INDEX IF NOT EXISTS idx_dq_target ON delivery_queue(target_type, target_id);
    `);
    log.debug('delivery_queue 表已就绪');
  }

  /**
   * 入队一条消息。
   * 相同 org_id + target_type + target_id 视为重复，返回已有条目 ID。
   */
  enqueue(input: EnqueueInput): DeliveryQueueEntry {
    // 去重: 相同 target 的 pending 条目
    const existing = this.db.prepare(
      `SELECT id FROM delivery_queue WHERE org_id = ? AND target_type = ? AND target_id = ? AND status = 'pending'`
    ).get(input.orgId, input.targetType, input.targetId) as { id: string } | undefined;

    if (existing) {
      log.debug({ id: existing.id }, '投递去重 — 返回已有条目');
      return this.getById(existing.id)!;
    }

    const id = `dq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO delivery_queue (id, org_id, target_type, target_id, payload, max_retries, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.orgId, input.targetType, input.targetId, input.payload, input.maxRetries ?? 5, now);

    log.debug({ id }, '投递条目已入队');
    return this.getById(id)!;
  }

  /**
   * 取出最旧的 pending 条目（FIFO）。
   * 仅在状态为 pending 且 next_retry_at 为 null 或已过时。
   */
  dequeue(): DeliveryQueueEntry | null {
    const row = this.db.prepare(`
      SELECT * FROM delivery_queue
      WHERE status = 'pending'
        AND (next_retry_at IS NULL OR next_retry_at <= datetime('now'))
      ORDER BY created_at ASC
      LIMIT 1
    `).get() as Record<string, unknown> | undefined;

    return row ? this.mapRow(row) : null;
  }

  /** 标记为已投递 */
  markDelivered(id: string): void {
    this.db.prepare(`
      UPDATE delivery_queue SET status = 'delivered', delivered_at = datetime('now') WHERE id = ?
    `).run(id);
    log.debug({ id }, '投递已确认');
  }

  /**
   * 标记为投递失败。
   * 递增重试计数，计算下次重试时间（退避）。
   * 超过 max_retries 标记为 failed。
   */
  markFailed(id: string): void {
    const row = this.db.prepare(
      `SELECT retry_count, max_retries FROM delivery_queue WHERE id = ?`
    ).get(id) as { retry_count: number; max_retries: number } | undefined;

    if (!row) return;

    const nextRetry = row.retry_count + 1 >= row.max_retries
      ? null // 超过最大重试 → 标记 failed
      : new Date(Date.now() + this.backoffMs(row.retry_count)).toISOString();

    const isMaxed = row.retry_count + 1 >= row.max_retries ? 1 : 0;
    this.db.prepare(`
      UPDATE delivery_queue
      SET retry_count = retry_count + 1,
          status = CASE WHEN ? = 1 THEN 'failed' ELSE status END,
          next_retry_at = ?
      WHERE id = ?
    `).run(isMaxed, nextRetry, id);

    log.debug({ id, retryCount: row.retry_count + 1 }, '投递失败 — 标记重试');
  }

  /** 查询所有待投递条目（启动恢复用） */
  peekPending(): DeliveryQueueEntry[] {
    const rows = this.db.prepare(`
      SELECT * FROM delivery_queue
      WHERE status = 'pending'
      ORDER BY created_at ASC
    `).all() as Record<string, unknown>[];

    return rows.map(r => this.mapRow(r));
  }

  // ═══ Private ═══

  /** 退避时间: [5s, 25s, 120s, 600s] */
  private backoffMs(attempt: number): number {
    const delays = [5000, 25000, 120000, 600000];
    return delays[Math.min(attempt, delays.length - 1)];
  }

  private getById(id: string): DeliveryQueueEntry | null {
    const row = this.db.prepare('SELECT * FROM delivery_queue WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.mapRow(row) : null;
  }

  private mapRow(row: Record<string, unknown>): DeliveryQueueEntry {
    return {
      id: row.id as string,
      orgId: row.org_id as string,
      targetType: row.target_type as TargetType,
      targetId: row.target_id as string,
      payload: row.payload as string,
      status: row.status as EntryStatus,
      retryCount: row.retry_count as number,
      maxRetries: row.max_retries as number,
      nextRetryAt: row.next_retry_at as string | null,
      createdAt: row.created_at as string,
      deliveredAt: row.delivered_at as string | null,
    };
  }
}
