/**
 * src/playbook/execution-store.ts — Playbook 执行记录持久化 (D80)
 *
 * L5 SQLite 存储，保留 90 天。
 * 基于 better-sqlite3 同步 API，模式与 evidence-store.ts 一致。
 *
 * 铁律 24+31: SQLite写入失败 → log.warn + degraded，不阻断Playbook执行
 * 铁律 38: 零 as any
 */
import Database from 'better-sqlite3';
import { createLogger } from '@synova/logger';
import type { PlaybookExecutionRecord } from './playbook-types';

const log = createLogger('playbook/execution-store');

/** 执行记录保留天数 */
const RETENTION_DAYS = 90;

/** DDL: playbook_executions 表 */
const DDL = `
CREATE TABLE IF NOT EXISTS playbook_executions (
  execution_id TEXT PRIMARY KEY,
  playbook_id TEXT NOT NULL,
  enterprise_id TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  record_json TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_playbook_executions_playbook ON playbook_executions(playbook_id);
CREATE INDEX IF NOT EXISTS idx_playbook_executions_enterprise ON playbook_executions(enterprise_id);
CREATE INDEX IF NOT EXISTS idx_playbook_executions_created ON playbook_executions(created_at);
`;

export class ExecutionStore {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.ensureSchema();
  }

  /** 建表 + 索引（幂等） */
  private ensureSchema(): void {
    try {
      // 分句执行 DDL（better-sqlite3 exec 支持多语句）
      this.db.exec(DDL);
      log.info('playbook_executions 表已就绪');
    } catch (err) {
      log.error({ err }, 'playbook_executions DDL 执行失败');
      throw err;
    }
  }

  /**
   * 创建执行记录。
   *
   * @param record - 完整的 PlaybookExecutionRecord
   * @returns executionId
   *
   * 降级: 写入失败 → log.warn + throw（由调用方决定是否阻断）
   */
  createExecutionRecord(record: PlaybookExecutionRecord): string {
    try {
      const raw = JSON.stringify(record);
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO playbook_executions
          (execution_id, playbook_id, enterprise_id, trigger_type, start_time, status, record_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        record.executionId,
        record.playbookId,
        record.enterpriseId,
        record.triggerType,
        record.startTime,
        record.finalOutput?.failedSteps > 0 ? 'failed' : 'completed',
        raw,
      );
      log.info({ executionId: record.executionId, playbookId: record.playbookId }, '执行记录已写入');
      return record.executionId;
    } catch (err) {
      log.warn({ err, executionId: record.executionId }, '执行记录写入失败');
      throw err;
    }
  }

  /**
   * 查询单条执行记录。
   *
   * @param executionId - 执行 ID
   * @returns 执行记录或 null
   */
  getExecutionRecord(executionId: string): PlaybookExecutionRecord | null {
    try {
      const row = this.db.prepare(
        'SELECT record_json FROM playbook_executions WHERE execution_id = ?',
      ).get(executionId) as { record_json: string } | undefined;

      if (!row) return null;
      return JSON.parse(row.record_json) as PlaybookExecutionRecord;
    } catch (err) {
      log.warn({ err, executionId }, '查询执行记录失败');
      return null;
    }
  }

  /**
   * 按 Playbook ID 列出执行记录。
   *
   * @param playbookId - Playbook ID
   * @param limit - 最大返回数（默认 20）
   */
  listExecutionsByPlaybook(playbookId: string, limit: number = 20): PlaybookExecutionRecord[] {
    try {
      const rows = this.db.prepare(
        'SELECT record_json FROM playbook_executions WHERE playbook_id = ? ORDER BY created_at DESC LIMIT ?',
      ).all(playbookId, limit) as Array<{ record_json: string }>;

      return rows.map(r => JSON.parse(r.record_json) as PlaybookExecutionRecord);
    } catch (err) {
      log.warn({ err, playbookId }, '按Playbook查询执行记录失败');
      return [];
    }
  }

  /**
   * 按企业 ID 列出执行记录。
   *
   * @param enterpriseId - 企业 ID
   * @param limit - 最大返回数（默认 20）
   */
  listExecutionsByEnterprise(enterpriseId: string, limit: number = 20): PlaybookExecutionRecord[] {
    try {
      const rows = this.db.prepare(
        'SELECT record_json FROM playbook_executions WHERE enterprise_id = ? ORDER BY created_at DESC LIMIT ?',
      ).all(enterpriseId, limit) as Array<{ record_json: string }>;

      return rows.map(r => JSON.parse(r.record_json) as PlaybookExecutionRecord);
    } catch (err) {
      log.warn({ err, enterpriseId }, '按企业查询执行记录失败');
      return [];
    }
  }

  /**
   * 清理超过 90 天的过期记录。
   *
   * @returns 删除的记录数
   */
  cleanExpiredRecords(): number {
    try {
      const result = this.db.prepare(
        `DELETE FROM playbook_executions WHERE created_at < datetime('now', ?)`,
      ).run(`-${RETENTION_DAYS} days`);

      if (result.changes > 0) {
        log.info({ deleted: result.changes }, '过期执行记录已清理');
      }
      return result.changes;
    } catch (err) {
      log.warn({ err }, '过期记录清理失败');
      return 0;
    }
  }
}
