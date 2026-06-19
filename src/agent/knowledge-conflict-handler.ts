/**
 * agent/knowledge-conflict-handler.ts — 知识冲突处理器
 *
 * 管理 knowledge/ 加载过程中检测到的知识冲突。
 * 提供 CRUD 接口供 FDE 工作台使用。
 *
 * 铁律 39: L2 编排层——通过 KnowledgeStore(L4) 操作数据。
 */
import Database from 'better-sqlite3';
import { createLogger } from '../logger';

const log = createLogger('agent/knowledge-conflict-handler');

// ═══ Types ═══

export interface KnowledgeConflict {
  id: string;
  dimension: string;
  sources: string[];
  resolution: 'keep_higher_priority' | 'merge' | 'manual_review';
  timestamp: string;
  status: 'open' | 'resolved';
  resolvedBy?: string;
  resolvedAt?: string;
  resolutionNote?: string;
}

// ═══ Schema ═══

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS knowledge_conflicts (
  id TEXT PRIMARY KEY,
  dimension TEXT NOT NULL,
  sources TEXT NOT NULL,          -- JSON array of file paths
  resolution TEXT NOT NULL DEFAULT 'manual_review',
  timestamp TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  resolved_by TEXT,
  resolved_at TEXT,
  resolution_note TEXT
);
`;

// ═══ KnowledgeConflictHandler ═══

export class KnowledgeConflictHandler {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.db.exec(SCHEMA_SQL);
  }

  /** 记录一个新冲突 */
  report(conflict: Omit<KnowledgeConflict, 'id'>): KnowledgeConflict {
    const id = `kc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const record: KnowledgeConflict = { id, ...conflict };

    this.db.prepare(`
      INSERT INTO knowledge_conflicts (id, dimension, sources, resolution, timestamp, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.dimension,
      JSON.stringify(record.sources),
      record.resolution,
      record.timestamp,
      record.status,
    );

    log.info({ id, dimension: conflict.dimension }, '知识冲突已记录');
    return record;
  }

  /** 查询未解决的冲突（供 FDE 工作台使用） */
  listOpen(): KnowledgeConflict[] {
    const rows = this.db.prepare(`
      SELECT * FROM knowledge_conflicts WHERE status = 'open' ORDER BY timestamp DESC
    `).all() as Array<Record<string, unknown>>;

    return rows.map(row => ({
      ...row,
      sources: JSON.parse(String(row.sources || '[]')),
      resolvedBy: row.resolved_by as string | undefined,
      resolvedAt: row.resolved_at as string | undefined,
      resolutionNote: row.resolution_note as string | undefined,
    })) as KnowledgeConflict[];
  }

  /** 解决一个冲突 */
  resolve(
    id: string,
    resolution: KnowledgeConflict['resolution'],
    resolvedBy: string,
    note?: string,
  ): KnowledgeConflict | null {
    const row = this.db.prepare(`
      SELECT * FROM knowledge_conflicts WHERE id = ?
    `).get(id) as Record<string, unknown> | undefined;

    if (!row) {
      log.warn({ id }, '冲突不存在');
      return null;
    }

    this.db.prepare(`
      UPDATE knowledge_conflicts
      SET status = 'resolved', resolution = ?, resolved_by = ?, resolved_at = ?, resolution_note = ?
      WHERE id = ?
    `).run(resolution, resolvedBy, new Date().toISOString(), note || null, id);

    log.info({ id, resolution, resolvedBy }, '知识冲突已解决');
    return this.getById(id);
  }

  /** 统计 */
  countByStatus(): { open: number; resolved: number } {
    const openRow = this.db.prepare(`SELECT COUNT(*) as c FROM knowledge_conflicts WHERE status = 'open'`).get() as Record<string, unknown> | undefined;
    const resolvedRow = this.db.prepare(`SELECT COUNT(*) as c FROM knowledge_conflicts WHERE status = 'resolved'`).get() as Record<string, unknown> | undefined;
    const open = Number(openRow?.c) || 0;
    const resolved = Number(resolvedRow?.c) || 0;
    return { open, resolved };
  }

  private getById(id: string): KnowledgeConflict | null {
    const row = this.db.prepare(`SELECT * FROM knowledge_conflicts WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      ...row,
      sources: JSON.parse(String(row.sources || '[]')),
      resolvedBy: row.resolved_by as string | undefined,
      resolvedAt: row.resolved_at as string | undefined,
      resolutionNote: row.resolution_note as string | undefined,
    } as KnowledgeConflict;
  }
}
