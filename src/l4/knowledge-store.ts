/**
 * l4/knowledge-store.ts — 知识块存储 (M1-Slice3)
 *
 * SQLite + FTS5 全文索引。每条 KnowledgeChunk 携带权限标签。
 * L4 层不感知调用方身份，只执行 FilterClause。
 */
import Database from 'better-sqlite3';
// FilterClause type — 使用内联类型避免跨包 tsc 路径解析问题
export interface FilterClause {
  conditions: Array<{ field: string; operator: 'IN' | 'EQ' | 'NOT_EQ' | 'CONTAINS'; value: unknown }>;
}
import { createLogger } from '../logger';

const log = createLogger('l4/knowledge-store');

// ═══ Types ═══

export interface KnowledgeChunk {
  id: string;
  text: string;
  sourceType: string;       // 'document' | 'message' | 'phase0' | 'external'
  sourceId: string;          // 来源文档/消息 ID
  authorityLevel: 'internal_stored' | 'external_official' | 'external_reference' | 'reference';
  mimeType?: string;
  // 权限标签
  accessLevel: 'public' | 'team' | 'private';
  accessTeamId?: string;
  accessOwnerId?: string;
  accessSensitivity: 'normal' | 'sensitive' | 'restricted';
  // 元数据
  createdAt: string;
  updatedAt: string;
}

export interface SearchResult extends KnowledgeChunk {
  rank: number;              // FTS5 相关性排名
  snippet: string;           // 高亮摘要
}

export interface SearchStats {
  totalHits: number;
  filteredOut: number;       // 被权限过滤掉的数量
  latencyMs: number;
}

// ═══ Schema ═══

export class KnowledgeStore {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_chunks (
        id TEXT PRIMARY KEY,
        text TEXT NOT NULL,
        source_type TEXT NOT NULL,
        source_id TEXT NOT NULL,
        authority_level TEXT NOT NULL DEFAULT 'reference',
        mime_type TEXT,
        access_level TEXT NOT NULL DEFAULT 'private',
        access_team_id TEXT,
        access_owner_id TEXT,
        access_sensitivity TEXT NOT NULL DEFAULT 'normal',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_chunks_fts USING fts5(
        id UNINDEXED,
        text,
        source_type UNINDEXED,
        tokenize='unicode61'
      );
    `);

    // FTS5 同步触发器
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS kc_fts_insert AFTER INSERT ON knowledge_chunks BEGIN
        INSERT INTO knowledge_chunks_fts(id, text, source_type) VALUES (new.id, new.text, new.source_type);
      END;
      CREATE TRIGGER IF NOT EXISTS kc_fts_delete AFTER DELETE ON knowledge_chunks BEGIN
        INSERT INTO knowledge_chunks_fts(knowledge_chunks_fts, id, text, source_type) VALUES ('delete', old.id, old.text, old.source_type);
      END;
    `);

    // 审计日志表 (仅追加)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        user_id TEXT,
        query TEXT,
        total_hits INTEGER DEFAULT 0,
        filtered_out INTEGER DEFAULT 0,
        latency_ms INTEGER DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    log.info('KnowledgeStore schema initialized');
  }

  // ═══ CRUD ═══

  insert(chunk: Omit<KnowledgeChunk, 'id' | 'createdAt' | 'updatedAt'>): string {
    const id = `kc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO knowledge_chunks (id, text, source_type, source_id, authority_level, mime_type,
        access_level, access_team_id, access_owner_id, access_sensitivity, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(id, chunk.text, chunk.sourceType, chunk.sourceId, chunk.authorityLevel,
      chunk.mimeType || null, chunk.accessLevel, chunk.accessTeamId || null,
      chunk.accessOwnerId || null, chunk.accessSensitivity, now, now);
    return id;
  }

  /**
   * FTS5 全文搜索 + FilterClause 权限过滤。
   * L4 层不感知调用方身份 — 只接收 FilterClause 执行。
   *
   * @param query 搜索关键词
   * @param filter 权限过滤条件 (来自 AuthProvider)
   * @param limit 返回条数
   */
  search(query: string, filter: FilterClause, limit = 10): { results: SearchResult[]; stats: SearchStats } {
    const startTime = Date.now();
    const hasCJK = /[一-鿿]/.test(query);

    // FTS5 查询
    let rows: Array<Record<string, unknown>>;
    if (hasCJK) {
      // 中文使用 LIKE fallback
      const likePattern = `%${query}%`;
      rows = this.db.prepare(`
        SELECT k.*, 1 as rank, substr(k.text, max(0, instr(k.text, ?) - 40), 120) as snippet
        FROM knowledge_chunks k
        WHERE k.text LIKE ?
        ORDER BY k.updated_at DESC
        LIMIT ?
      `).all(query, likePattern, limit * 2) as Array<Record<string, unknown>>;
    } else {
      rows = this.db.prepare(`
        SELECT k.*, fts.rank, snippet(knowledge_chunks_fts, 1, '<b>', '</b>', '...', 40) as snippet
        FROM knowledge_chunks_fts fts
        JOIN knowledge_chunks k ON k.id = fts.id
        WHERE knowledge_chunks_fts MATCH ?
        ORDER BY fts.rank
        LIMIT ?
      `).all(query, limit * 2) as Array<Record<string, unknown>>;
    }

    // 权限过滤
    const filtered = filter.conditions.length === 0
      ? rows  // admin: 无过滤
      : rows.filter(row => this.matchFilter(row, filter));

    const stats: SearchStats = {
      totalHits: rows.length,
      filteredOut: rows.length - filtered.length,
      latencyMs: Date.now() - startTime,
    };

    const results = filtered.slice(0, limit).map(r => ({
      id: r.id as string,
      text: r.text as string,
      sourceType: r.source_type as string,
      sourceId: r.source_id as string,
      authorityLevel: r.authority_level as KnowledgeChunk['authorityLevel'],
      mimeType: r.mime_type as string | undefined,
      accessLevel: r.access_level as KnowledgeChunk['accessLevel'],
      accessTeamId: r.access_team_id as string | undefined,
      accessOwnerId: r.access_owner_id as string | undefined,
      accessSensitivity: r.access_sensitivity as KnowledgeChunk['accessSensitivity'],
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
      rank: (r.rank as number) || 1,
      snippet: (r.snippet as string) || (r.text as string).slice(0, 120),
    }));

    return { results, stats };
  }

  /** 记录审计日志 */
  auditLog(eventType: string, userId: string, queryStr: string, stats: SearchStats): void {
    this.db.prepare(`
      INSERT INTO knowledge_audit (event_type, user_id, query, total_hits, filtered_out, latency_ms)
      VALUES (?,?,?,?,?,?)
    `).run(eventType, userId, queryStr, stats.totalHits, stats.filteredOut, stats.latencyMs);
  }

  /** 获取存储统计 */
  stats(): { totalChunks: number; totalSizeBytes: number } {
    const count = (this.db.prepare('SELECT COUNT(*) as c FROM knowledge_chunks').get() as Record<string, unknown>).c as number || 0;
    const size = (this.db.prepare('SELECT SUM(LENGTH(text)) as s FROM knowledge_chunks').get() as Record<string, unknown>).s as number || 0;
    return { totalChunks: count, totalSizeBytes: size };
  }

  // ═══ 权限过滤 ═══

  private matchFilter(row: Record<string, unknown>, filter: FilterClause): boolean {
    for (const c of filter.conditions) {
      const field = c.field.replace('access.', '');
      const colMap: Record<string, string> = {
        level: 'access_level',
        teamId: 'access_team_id',
        ownerId: 'access_owner_id',
        sensitivity: 'access_sensitivity',
        allowedUsers: 'access_owner_id',
      };
      const col = colMap[field] || field;
      const val = row[col];

      if (c.operator === 'IN') {
        const allowed = c.value as unknown[];
        if (!allowed.includes(val)) return false;
      } else if (c.operator === 'EQ') {
        if (val !== c.value) return false;
      } else if (c.operator === 'NOT_EQ') {
        if (val === c.value) return false;
      }
    }
    return true;
  }
}
