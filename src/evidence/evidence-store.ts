/**
 * evidence/evidence-store.ts — 证据持久化 (SQLite + FTS5) (Phase 2.1a)
 *
 * 复用 session-store.ts 的 FTS5 模式。
 */
import Database from 'better-sqlite3';
import type { Evidence, EvidenceFilter } from './types';
import { createLogger } from '../logger';

const log = createLogger('evidence/store');

export class EvidenceStore {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS evidence (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        source_id TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 0.5,
        collected_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT,
        org_id TEXT NOT NULL,
        session_id TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_evidence_org ON evidence(org_id);
      CREATE INDEX IF NOT EXISTS idx_evidence_source ON evidence(source);
      CREATE INDEX IF NOT EXISTS idx_evidence_type ON evidence(type);

      -- FTS5 全文检索 (复用 session-store 模式)
      CREATE VIRTUAL TABLE IF NOT EXISTS evidence_fts USING fts5(
        content, type, source, content=evidence, content_rowid=rowid
      );
    `);

    // FTS5 triggers
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS evidence_ai AFTER INSERT ON evidence BEGIN
        INSERT INTO evidence_fts(rowid, content, type, source)
        VALUES (new.rowid, new.content, new.type, new.source);
      END;
      CREATE TRIGGER IF NOT EXISTS evidence_ad AFTER DELETE ON evidence BEGIN
        INSERT INTO evidence_fts(evidence_fts, rowid, content, type, source)
        VALUES ('delete', old.rowid, old.content, old.type, old.source);
      END;
    `);
  }

  /** Add evidence (deduplicate by source+type+content hash) */
  add(evidence: Evidence): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO evidence (id, source, source_id, type, content, confidence, collected_at, expires_at, org_id, session_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      evidence.id, evidence.source, evidence.sourceId, evidence.type,
      evidence.content, evidence.confidence,
      evidence.collectedAt || new Date().toISOString(),
      evidence.expiresAt || null,
      evidence.orgId, evidence.sessionId || null,
    );
    log.debug({ id: evidence.id, source: evidence.source }, '证据已存储');
  }

  /** Query evidence with filters */
  query(filter: EvidenceFilter = {}): Evidence[] {
    const conditions: string[] = ['1=1'];
    const params: unknown[] = [];

    if (filter.source) { conditions.push('source = ?'); params.push(filter.source); }
    if (filter.type) { conditions.push('type = ?'); params.push(filter.type); }
    if (filter.orgId) { conditions.push('org_id = ?'); params.push(filter.orgId); }
    if (filter.sessionId) { conditions.push('session_id = ?'); params.push(filter.sessionId); }
    if (filter.minConfidence !== undefined) { conditions.push('confidence >= ?'); params.push(filter.minConfidence); }

    const sql = `SELECT * FROM evidence WHERE ${conditions.join(' AND ')} ORDER BY collected_at DESC` +
      (filter.limit ? ` LIMIT ${filter.limit}` : '');

    return this.db.prepare(sql).all(...params) as Evidence[];
  }

  /** Full-text search */
  search(query: string, limit = 10): Evidence[] {
    return this.db.prepare(`
      SELECT e.* FROM evidence e
      INNER JOIN evidence_fts fts ON e.rowid = fts.rowid
      WHERE evidence_fts MATCH ?
      ORDER BY rank LIMIT ?
    `).all(query, limit) as Evidence[];
  }

  /** Count evidence by dimension for an org */
  countByType(orgId: string): Record<string, number> {
    const rows = this.db.prepare(
      'SELECT type, COUNT(*) as cnt FROM evidence WHERE org_id = ? GROUP BY type',
    ).all(orgId) as Array<{ type: string; cnt: number }>;

    const counts: Record<string, number> = {};
    for (const row of rows) counts[row.type] = row.cnt;
    return counts;
  }

  /** Delete expired evidence */
  expireOld(maxAgeMs: number): number {
    const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
    const result = this.db.prepare(
      'DELETE FROM evidence WHERE collected_at < ?',
    ).run(cutoff);
    return result.changes;
  }
}
