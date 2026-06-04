/**
 * expert-platform/store.ts — Expert 贡献 SQLite 持久化 (SA-01)
 *
 * 替换 routes/expert.ts 的内存 Map。进程重启后数据不丢失。
 */
import Database from 'better-sqlite3';
import { createLogger } from '../logger';

const log = createLogger('expert-platform/store');

export interface ContributionEntry {
  id: string;
  expertId: string;
  industry: string;
  scenario: string;
  description: string;
  status: string;
  templateJson: string | null;
  submittedAt: string;
}

export class ExpertStore {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS expert_contributions (
        id TEXT PRIMARY KEY,
        expert_id TEXT NOT NULL,
        industry TEXT NOT NULL,
        scenario TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'submitted',
        template_json TEXT,
        submitted_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_expert_contrib_expert ON expert_contributions(expert_id);
      CREATE INDEX IF NOT EXISTS idx_expert_contrib_industry ON expert_contributions(industry);
      CREATE INDEX IF NOT EXISTS idx_expert_contrib_status ON expert_contributions(status);
    `);
  }

  set(entry: ContributionEntry): void {
    this.db.prepare(`INSERT OR REPLACE INTO expert_contributions
      (id, expert_id, industry, scenario, description, status, template_json, submitted_at)
      VALUES (?,?,?,?,?,?,?,?)`).run(
      entry.id, entry.expertId, entry.industry, entry.scenario,
      entry.description, entry.status, entry.templateJson, entry.submittedAt,
    );
  }

  get(id: string): ContributionEntry | null {
    const row = this.db.prepare('SELECT * FROM expert_contributions WHERE id=?').get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.rowToEntry(row);
  }

  getByExpert(expertId: string): ContributionEntry[] {
    const rows = this.db.prepare(
      'SELECT * FROM expert_contributions WHERE expert_id=? ORDER BY submitted_at DESC'
    ).all(expertId) as Array<Record<string, unknown>>;
    return rows.map(r => this.rowToEntry(r));
  }

  getByIndustry(industry: string, limit = 20): ContributionEntry[] {
    const rows = this.db.prepare(
      "SELECT * FROM expert_contributions WHERE industry=? AND status IN ('published','validated') ORDER BY submitted_at DESC LIMIT ?"
    ).all(industry, limit) as Array<Record<string, unknown>>;
    return rows.map(r => this.rowToEntry(r));
  }

  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) as c FROM expert_contributions').get() as { c: number };
    return row.c;
  }

  private rowToEntry(row: Record<string, unknown>): ContributionEntry {
    return {
      id: row.id as string,
      expertId: row.expert_id as string,
      industry: row.industry as string,
      scenario: row.scenario as string,
      description: row.description as string,
      status: row.status as string,
      templateJson: row.template_json as string | null,
      submittedAt: row.submitted_at as string,
    };
  }
}

// ═══ EC-09: SQLiteOutcomeStore — OutcomeTracker 的 SQLite 实现 ═══

import type { OutcomeRecord, OutcomeStore } from './outcome-tracker';

export class SQLiteOutcomeStore implements OutcomeStore {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS expert_outcomes (
        id TEXT PRIMARY KEY,
        template_id TEXT NOT NULL,
        diagnosis_id TEXT NOT NULL,
        org_id TEXT NOT NULL,
        adopted INTEGER DEFAULT 0,
        effectiveness REAL,
        check_point INTEGER NOT NULL,
        recorded_at TEXT DEFAULT (datetime('now')),
        notes TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_outcomes_template
        ON expert_outcomes(template_id);
    `);
  }

  save(outcome: OutcomeRecord): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO expert_outcomes
        (id, template_id, diagnosis_id, org_id, adopted, effectiveness, check_point, recorded_at, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      outcome.id, outcome.templateId, outcome.diagnosisId, outcome.orgId,
      outcome.adopted ? 1 : 0, outcome.effectiveness ?? null,
      outcome.checkPoint, outcome.recordedAt, outcome.notes ?? null,
    );
  }

  getByTemplate(templateId: string): OutcomeRecord[] {
    const rows = this.db.prepare(`
      SELECT * FROM expert_outcomes WHERE template_id = ? ORDER BY recorded_at DESC
    `).all(templateId) as Array<Record<string, unknown>>;

    return rows.map(r => ({
      id: r.id as string,
      templateId: r.template_id as string,
      diagnosisId: r.diagnosis_id as string,
      orgId: r.org_id as string,
      adopted: !!(r.adopted as number),
      effectiveness: r.effectiveness as number | undefined,
      checkPoint: r.check_point as 30 | 60 | 90,
      recordedAt: r.recorded_at as string,
      notes: r.notes as string | undefined,
    }));
  }

  getEffectivenessRate(templateId: string): number | null {
    const row = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN effectiveness >= 0.5 THEN 1 ELSE 0 END) as effective
      FROM expert_outcomes
      WHERE template_id = ? AND effectiveness IS NOT NULL
    `).get(templateId) as { total: number; effective: number } | undefined;

    if (!row || row.total === 0) return null;
    return Math.round((row.effective / row.total) * 100) / 100;
  }
}
