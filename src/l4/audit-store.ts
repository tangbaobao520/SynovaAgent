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
import { computeAuditHash, buildDataSnapshot, GENESIS_HASH } from '../security/crypto-hash-utils';

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
  /** D41: 上一条记录的 current_hash（创世块为 64 个 '0'） */
  prevHash?: string;
  /** D41: 本条记录的 SHA-256 哈希值 */
  currentHash?: string;
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

      // D41: 哈希链字段 — 安全 ALTER TABLE ADD COLUMN（不重建表）
      const columns = this.db.pragma('table_info(audit_log)') as Array<{ name: string }>;
      const colNames = new Set(columns.map(c => c.name));
      if (!colNames.has('prev_hash')) {
        this.db.exec("ALTER TABLE audit_log ADD COLUMN prev_hash TEXT DEFAULT ''");
      }
      if (!colNames.has('current_hash')) {
        this.db.exec("ALTER TABLE audit_log ADD COLUMN current_hash TEXT DEFAULT ''");
      }
    } catch (err: unknown) {
      log.warn({ err }, 'audit_log schema 初始化失败 — degraded');
    }
  }

  /**
   * 写入审计日志。
   * 自动计算 SHA-256 哈希链（prev_hash → current_hash）以支持防篡改验证。
   * 失败时仅记录警告，不抛出异常（降级）。
   */
  log(entry: AuditEntryInput): void {
    try {
      const id = `aud_${randomUUID().slice(0, 8)}`;
      const createdAt = new Date().toISOString();

      // D41: 查询上一条 current_hash 构建哈希链
      const last = this.db.prepare(
        'SELECT current_hash FROM audit_log WHERE org_id=? ORDER BY created_at DESC, rowid DESC LIMIT 1'
      ).get(entry.orgId) as { current_hash?: string } | undefined;
      const prevHash = last?.current_hash || GENESIS_HASH;

      const dataSnapshot = buildDataSnapshot(entry);
      const currentHash = computeAuditHash(
        entry.action, entry.actorId, entry.orgId, createdAt, prevHash, dataSnapshot,
      );

      this.db.prepare(`
        INSERT INTO audit_log (id, org_id, actor_id, actor_role, action,
          target_type, target_id, old_value, new_value, ip_address, user_agent,
          created_at, prev_hash, current_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        prevHash,
        currentHash,
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
   * 验证指定 org 的审计日志哈希链完整性。
   *
   * 按时间正序遍历所有记录，检查每条的 prev_hash 是否等于上条的 current_hash。
   * 哈希链断裂说明日志已被篡改（中间某行被直接修改）。
   *
   * @param orgId - 组织 ID
   * @returns {valid, brokenAt?, totalRecords}
   *   - valid: true = 链完整；false = 链断裂
   *   - brokenAt: 断裂位置的索引（1-based），仅 valid=false 时存在
   *   - totalRecords: 该组织总审计记录数
   */
  verifyChain(orgId: string): { valid: boolean; brokenAt?: number; totalRecords: number } {
    try {
      const rows = this.db.prepare(
        'SELECT * FROM audit_log WHERE org_id=? ORDER BY created_at ASC, rowid ASC'
      ).all(orgId) as Array<Record<string, unknown>>;

      if (rows.length <= 1) {
        // 0 或 1 条记录 — 链自然成立
        return { valid: true, totalRecords: rows.length };
      }

      for (let i = 1; i < rows.length; i++) {
        const prev = rows[i - 1];
        const curr = rows[i];
        const prevHash = prev.current_hash as string | undefined;
        const expectedPrev = curr.prev_hash as string | undefined;

        // 跳过旧记录（无哈希字段）
        if (!prevHash && !expectedPrev) continue;
        // 一条有哈希一条没有 → 断裂
        if (!prevHash || !expectedPrev) {
          return { valid: false, brokenAt: i, totalRecords: rows.length };
        }
        if (prevHash !== expectedPrev) {
          return { valid: false, brokenAt: i, totalRecords: rows.length };
        }
      }
      return { valid: true, totalRecords: rows.length };
    } catch (err: unknown) {
      log.warn({ err, orgId }, '审计哈希链验证失败 — degraded');
      return { valid: false, totalRecords: 0 };
    }
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
    const entry: AuditEntry = {
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
    // D41: 哈希链字段（可选 — 旧记录无此字段）
    if (row.prev_hash) entry.prevHash = row.prev_hash as string;
    if (row.current_hash) entry.currentHash = row.current_hash as string;
    return entry;
  }
}
