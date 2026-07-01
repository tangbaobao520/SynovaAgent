/**
 * l4/audit-store.ts — 审计日志存储 (Phase 0.3, Desktop 实施方案)
 *
 * 设计原则:
 * - 仅追加（append-only），无 UPDATE/DELETE 能力
 * - 写入失败时降级（log.warn），不影响主业务流程
 * - 字段同时存储 snake_case（SQLite）和 camelCase（API 响应）
 *
 * 表结构:
 *   audit_log (
 *     id         TEXT PRIMARY KEY,
 *     org_id     TEXT NOT NULL,
 *     actor_id   TEXT NOT NULL,
 *     actor_role TEXT NOT NULL,
 *     action     TEXT NOT NULL,
 *     target_type TEXT,
 *     target_id  TEXT,
 *     old_value  TEXT,
 *     new_value  TEXT,
 *     ip_address  TEXT,
 *     user_agent TEXT,
 *     created_at TEXT NOT NULL DEFAULT (datetime('now'))
 *   )
 */
import { randomUUID } from 'crypto';
import { createLogger } from '@synova/logger';

const log = createLogger('l4/audit-store');

// ════════════════════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════════════════════

export interface AuditEntryInput {
  orgId: string;
  actorId: string;
  actorRole: string;
  action: string;
  targetType?: string;
  targetId?: string;
  oldValue?: string;
  newValue?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditEntry extends AuditEntryInput {
  id: string;
  createdAt: string;
}

export interface AuditQuery {
  action?: string;
  actorId?: string;
  targetType?: string;
  limit?: number;
}

// ════════════════════════════════════════════════════════════════
// Store
// ════════════════════════════════════════════════════════════════

export class AuditStore {
  private db: import('better-sqlite3').Database;

  constructor(db: import('better-sqlite3').Database) {
    this.db = db;
    this.initSchema();
  }

  private initSchema(): void {
    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS audit_log (
          id         TEXT PRIMARY KEY,
          org_id     TEXT NOT NULL,
          actor_id   TEXT NOT NULL,
          actor_role TEXT NOT NULL,
          action     TEXT NOT NULL,
          target_type TEXT,
          target_id  TEXT,
          old_value  TEXT,
          new_value  TEXT,
          ip_address  TEXT,
          user_agent TEXT,
          created_at TEXT NOT NULL
        )
      `);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_org ON audit_log(org_id, created_at)`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(org_id, actor_id, created_at)`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(org_id, action, created_at)`);
    } catch (err: unknown) {
      log.warn({ err }, 'audit_log schema 初始化失败 — degraded');
    }
  }

  /**
   * 写入审计日志。
   * 失败时仅记录警告，不抛出异常（降级）。
   */
  log(entry: AuditEntryInput): void {
    try {
      const id = `aud_${randomUUID().slice(0, 8)}`;
      const createdAt = new Date().toISOString();

      this.db.prepare(`
        INSERT INTO audit_log (id, org_id, actor_id, actor_role, action,
          target_type, target_id, old_value, new_value, ip_address, user_agent, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        entry.orgId,
        entry.actorId,
        entry.actorRole,
        entry.action,
        entry.targetType || null,
        entry.targetId || null,
        entry.oldValue || null,
        entry.newValue || null,
        entry.ipAddress || null,
        entry.userAgent || null,
        createdAt,
      );
    } catch (err: unknown) {
      log.warn({ err, action: entry.action }, '审计日志写入失败 — degraded');
    }
  }

  /**
   * 按 orgId 查询审计日志。
   * 支持 action/actorId/targetType 过滤和 limit 分页。
   * 结果按时间倒序。
   */
  query(orgId: string, filters: AuditQuery): AuditEntry[] {
    try {
      const conditions: string[] = ['org_id = ?'];
      const params: unknown[] = [orgId];

      if (filters.action) {
        conditions.push('action = ?');
        params.push(filters.action);
      }
      if (filters.actorId) {
        conditions.push('actor_id = ?');
        params.push(filters.actorId);
      }
      if (filters.targetType) {
        conditions.push('target_type = ?');
        params.push(filters.targetType);
      }

      const limit = filters.limit && filters.limit > 0 ? filters.limit : 50;
      const sql = `SELECT * FROM audit_log WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT ?`;
      params.push(limit);

      const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
      return rows.map(this.rowToEntry);
    } catch (err: unknown) {
      log.warn({ err, orgId }, '审计日志查询失败 — degraded');
      return [];
    }
  }

  /**
   * 查询指定 GA 的操作历史。
   */
  getGAHistory(orgId: string, gaId: string): AuditEntry[] {
    return this.query(orgId, { actorId: gaId });
  }

  /**
   * 原始 SQL 查询（只读）。
   * 用于 BehaviorMonitor 等需要灵活时间范围查询的场景。
   * 仅允许 SELECT 语句。
   */
  rawQuery(sql: string, params: unknown[]): unknown[] {
    try {
      const upper = sql.trim().toUpperCase();
      if (!upper.startsWith('SELECT')) throw new Error('仅允许 SELECT 查询');
      return this.db.prepare(sql).all(...params);
    } catch (err: unknown) {
      log.warn({ err }, 'audit_store.rawQuery 失败 — degraded');
      return [];
    }
  }

  /**
   * SQLite 行 → camelCase AuditEntry
   */
  private rowToEntry(row: Record<string, unknown>): AuditEntry {
    return {
      id: row.id as string,
      orgId: row.org_id as string,
      actorId: row.actor_id as string,
      actorRole: row.actor_role as string,
      action: row.action as string,
      targetType: row.target_type as string || undefined,
      targetId: row.target_id as string || undefined,
      oldValue: row.old_value as string || undefined,
      newValue: row.new_value as string || undefined,
      ipAddress: row.ip_address as string || undefined,
      userAgent: row.user_agent as string || undefined,
      createdAt: row.created_at as string,
    };
  }
}
