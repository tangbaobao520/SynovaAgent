/**
 * l4/agent-memory-store.ts — Agent 级记忆存储 (P0 Loop Engineering 缺口修复)
 *
 * Loop Engineering 审计 #11: 有知识库无 Agent 记忆 (40%)。
 * 本模块填补缺口 — ConversationEngine 可通过此 store 记住/回忆/遗忘信息。
 *
 * 特性:
 *   - SQLite 持久化 + LRU 内存缓存
 *   - FTS5 全文搜索
 *   - TTL 自动过期
 *   - 5 种记忆类型: fact / preference / decision / pattern / entity
 *   - 租户隔离 (orgId 强制)
 *
 * 铁律 39: L4 本体层。通过 SQLite (L5) 持久化。
 */

import type Database from 'better-sqlite3';
import { createLogger } from '@synova/logger';

const log = createLogger('l4/agent-memory-store');

// ═══ Types ═══

export type MemoryType = 'fact' | 'preference' | 'decision' | 'pattern' | 'entity' | 'enterprise_fact';

export interface MemoryEntry {
  id: string;
  orgId: string;
  key: string;
  value: string;
  type: MemoryType;
  confidence: number;    // 0-1
  source: string;        // 来源: 'diagnosis' | 'user_feedback' | 'expert_finding' | 'manual'
  tags: string[];        // 可搜索标签
  createdAt: string;     // ISO 8601
  updatedAt: string;
  expiresAt: string | null; // TTL, null = 永不过期
  accessCount: number;
  // v1.6 Slice 8: 企业事实层——版本链字段
  version?: number;
  supersededBy?: string | null;
  changeReason?: string;
  changedBy?: string;
  effectiveFrom?: string;
}

export interface MemoryQuery {
  orgId: string;
  key?: string;
  type?: MemoryType;
  tags?: string[];
  search?: string;       // FTS5 全文搜索
  minConfidence?: number;
  limit?: number;
  offset?: number;
}

export interface MemoryStats {
  totalEntries: number;
  byType: Record<string, number>;
  byOrg: Record<string, number>;
  expiredCount: number;
}

// ═══ AgentMemoryStore ═══

export class AgentMemoryStore {
  private db: Database.Database;
  private cache: Map<string, MemoryEntry>;  // LRU cache: orgId:key → entry
  private maxCacheSize: number;

  constructor(db: Database.Database, maxCacheSize = 500) {
    this.db = db;
    this.cache = new Map();
    this.maxCacheSize = maxCacheSize;
    this.initSchema();
    log.info('AgentMemoryStore 已初始化');
  }

  // ═══ Public API ═══

  /** 记住一条信息 */
  remember(entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt' | 'accessCount'>): MemoryEntry {
    const id = `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    const full: MemoryEntry = {
      ...entry,
      id,
      createdAt: now,
      updatedAt: now,
      accessCount: 0,
      tags: entry.tags || [],
    };

    // UPSERT: 同 orgId+key 覆盖旧值
    const existing = this.db.prepare(
      `SELECT id FROM agent_memory WHERE org_id = ? AND key = ?`
    ).get(entry.orgId, entry.key) as { id: string } | undefined;

    if (existing) {
      this.db.prepare(`
        UPDATE agent_memory SET value=?, type=?, confidence=?, source=?, tags=?, updated_at=?, expires_at=?
        WHERE id=?
      `).run(
        full.value, full.type, full.confidence, full.source,
        JSON.stringify(full.tags), now, full.expiresAt, existing.id,
      );
      full.id = existing.id;
    } else {
      this.db.prepare(`
        INSERT INTO agent_memory (id, org_id, key, value, type, confidence, source, tags, created_at, updated_at, expires_at, access_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      `).run(
        full.id, full.orgId, full.key, full.value, full.type,
        full.confidence, full.source, JSON.stringify(full.tags),
        full.createdAt, full.updatedAt, full.expiresAt,
      );
    }

    // Update cache
    this.cacheSet(full);
    log.debug({ key: full.key, type: full.type, orgId: full.orgId }, '记忆已存储');
    return full;
  }

  /** 回忆一条信息 */
  recall(orgId: string, key: string): MemoryEntry | null {
    // Check cache first
    const cacheKey = `${orgId}:${key}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      if (this.isExpired(cached)) {
        this.cache.delete(cacheKey);
        return null;
      }
      // Update access count (async, fire-and-forget)
      this.db.prepare(`UPDATE agent_memory SET access_count = access_count + 1 WHERE id = ?`).run(cached.id);
      cached.accessCount++;
      return cached;
    }

    // Query DB
    const row = this.db.prepare(
      `SELECT * FROM agent_memory WHERE org_id = ? AND key = ? AND (expires_at IS NULL OR expires_at > datetime('now'))`
    ).get(orgId, key) as Record<string, unknown> | undefined;

    if (!row) return null;

    const entry = this.rowToEntry(row);
    this.cacheSet(entry);
    // Update access count
    this.db.prepare(`UPDATE agent_memory SET access_count = access_count + 1 WHERE id = ?`).run(entry.id);
    return entry;
  }

  /** 遗忘一条信息 */
  forget(orgId: string, key: string): boolean {
    const cacheKey = `${orgId}:${key}`;
    this.cache.delete(cacheKey);
    const result = this.db.prepare(
      `DELETE FROM agent_memory WHERE org_id = ? AND key = ?`
    ).run(orgId, key);
    const deleted = result.changes > 0;
    if (deleted) log.debug({ key, orgId }, '记忆已遗忘');
    return deleted;
  }

  /** 列出某组织的所有记忆 */
  list(query: MemoryQuery): MemoryEntry[] {
    const conditions: string[] = ['(expires_at IS NULL OR expires_at > datetime(\'now\'))'];
    const params: unknown[] = [];

    conditions.push('org_id = ?');
    params.push(query.orgId);

    if (query.type) {
      conditions.push('type = ?');
      params.push(query.type);
    }
    if (query.minConfidence !== undefined) {
      conditions.push('confidence >= ?');
      params.push(query.minConfidence);
    }
    if (query.tags && query.tags.length > 0) {
      // SQLite JSON 数组包含检查
      for (const tag of query.tags) {
        conditions.push(`tags LIKE ?`);
        params.push(`%"${tag}"%`);
      }
    }

    const where = conditions.join(' AND ');
    const limit = Math.min(query.limit || 50, 200);
    const offset = query.offset || 0;

    const rows = this.db.prepare(
      `SELECT * FROM agent_memory WHERE ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset) as Record<string, unknown>[];

    return rows.map(r => this.rowToEntry(r));
  }

  /** FTS5 全文搜索记忆 */
  search(orgId: string, query: string, limit = 20): MemoryEntry[] {
    const rows = this.db.prepare(`
      SELECT m.* FROM agent_memory m
      INNER JOIN agent_memory_fts f ON m.id = f.id
      WHERE f.value MATCH ? AND m.org_id = ?
        AND (m.expires_at IS NULL OR m.expires_at > datetime('now'))
      ORDER BY rank
      LIMIT ?
    `).all(query, orgId, limit) as Record<string, unknown>[];

    return rows.map(r => this.rowToEntry(r));
  }

  /** 获取统计信息 */
  getStats(orgId?: string): MemoryStats {
    const orgFilter = orgId ? 'WHERE org_id = ?' : '';
    const params = orgId ? [orgId] : [];

    const total = (this.db.prepare(
      `SELECT COUNT(*) as c FROM agent_memory ${orgFilter}`
    ).get(...params) as { c: number }).c;

    const byType = this.db.prepare(
      `SELECT type, COUNT(*) as c FROM agent_memory ${orgFilter} GROUP BY type`
    ).all(...params) as Array<{ type: string; c: number }>;

    const byOrg = this.db.prepare(
      `SELECT org_id, COUNT(*) as c FROM agent_memory GROUP BY org_id`
    ).all() as Array<{ org_id: string; c: number }>;

    const expired = (this.db.prepare(
      `SELECT COUNT(*) as c FROM agent_memory WHERE expires_at IS NOT NULL AND expires_at <= datetime('now')`
    ).get() as { c: number }).c;

    return {
      totalEntries: total,
      byType: Object.fromEntries(byType.map(r => [r.type, r.c])),
      byOrg: Object.fromEntries(byOrg.map(r => [r.org_id, r.c])),
      expiredCount: expired,
    };
  }

  /** 清理过期记忆 */
  purgeExpired(): number {
    const result = this.db.prepare(
      `DELETE FROM agent_memory WHERE expires_at IS NOT NULL AND expires_at <= datetime('now')`
    ).run();
    if (result.changes > 0) {
      log.info({ count: result.changes }, '过期记忆已清理');
    }
    // Also clear expired from cache
    for (const [key, entry] of this.cache) {
      if (this.isExpired(entry)) this.cache.delete(key);
    }
    return result.changes;
  }

  /** 获取与某实体相关的所有记忆 */
  recallEntity(orgId: string, entityName: string): MemoryEntry[] {
    return this.list({
      orgId,
      tags: [entityName],
      limit: 50,
    });
  }

  // ═══ Private ═══

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_memory (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('fact','preference','decision','pattern','entity','enterprise_fact')),
        confidence REAL NOT NULL DEFAULT 0.5,
        source TEXT NOT NULL DEFAULT 'manual',
        tags TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT,
        access_count INTEGER NOT NULL DEFAULT 0,
        UNIQUE(org_id, key)
      );

      CREATE INDEX IF NOT EXISTS idx_agent_memory_org ON agent_memory(org_id);
      CREATE INDEX IF NOT EXISTS idx_agent_memory_type ON agent_memory(org_id, type);
      CREATE INDEX IF NOT EXISTS idx_agent_memory_expires ON agent_memory(expires_at);

      -- FTS5 全文搜索
      CREATE VIRTUAL TABLE IF NOT EXISTS agent_memory_fts USING fts5(
        id UNINDEXED,
        key,
        value,
        content='agent_memory',
        content_rowid='rowid'
      );

      -- FTS5 同步触发器
      CREATE TRIGGER IF NOT EXISTS agent_memory_ai AFTER INSERT ON agent_memory BEGIN
        INSERT INTO agent_memory_fts(rowid, id, key, value)
        VALUES (new.rowid, new.id, new.key, new.value);
      END;

      CREATE TRIGGER IF NOT EXISTS agent_memory_ad AFTER DELETE ON agent_memory BEGIN
        INSERT INTO agent_memory_fts(agent_memory_fts, rowid, id, key, value)
        VALUES ('delete', old.rowid, old.id, old.key, old.value);
      END;

      CREATE TRIGGER IF NOT EXISTS agent_memory_au AFTER UPDATE ON agent_memory BEGIN
        INSERT INTO agent_memory_fts(agent_memory_fts, rowid, id, key, value)
        VALUES ('delete', old.rowid, old.id, old.key, old.value);
        INSERT INTO agent_memory_fts(rowid, id, key, value)
        VALUES (new.rowid, new.id, new.key, new.value);
      END;
    `);
  }

  private rowToEntry(row: Record<string, unknown>): MemoryEntry {
    let tags: string[] = [];
    try { tags = JSON.parse(row.tags as string); } catch { /* expected: tags may be malformed */ tags = []; }

    return {
      id: row.id as string,
      orgId: row.org_id as string,
      key: row.key as string,
      value: row.value as string,
      type: row.type as MemoryType,
      confidence: row.confidence as number,
      source: row.source as string,
      tags,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      expiresAt: row.expires_at as string | null,
      accessCount: row.access_count as number,
    };
  }

  private cacheSet(entry: MemoryEntry): void {
    const key = `${entry.orgId}:${entry.key}`;
    // LRU eviction
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, entry);
  }

  private isExpired(entry: MemoryEntry): boolean {
    if (!entry.expiresAt) return false;
    return new Date(entry.expiresAt) <= new Date();
  }
}

// ═══ Singleton ═══

let _instance: AgentMemoryStore | null = null;

export function getAgentMemoryStore(db?: Database.Database): AgentMemoryStore {
  if (db) { _instance = new AgentMemoryStore(db); return _instance; }
  if (!_instance) throw new Error('AgentMemoryStore 未初始化 — 请先调用 getAgentMemoryStore(db)');
  return _instance;
}
