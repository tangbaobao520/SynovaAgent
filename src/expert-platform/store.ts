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
