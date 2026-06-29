/**
 * security/connector-audit.ts — 连接器数据访问审计日志 (L5 Security)
 *
 * L5-SECURITY-SANDBOX §P1: 每次连接器数据访问都记录审计日志。
 * SQLite 持久化, 不可篡改 (append-only).
 */
import Database from 'better-sqlite3';
import { createLogger } from '@synova/logger';

const log = createLogger('security/connector-audit');

export interface AuditEntry {
  id?: number;
  connectorId: string;
  connectorName: string;
  action: 'connect' | 'disconnect' | 'read' | 'write' | 'error';
  stream?: string;
  recordsCount?: number;
  error?: string;
  degraded?: boolean;
  timestamp: string;
  orgId: string;
}

export class ConnectorAuditLog {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS connector_audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        connector_id TEXT NOT NULL,
        connector_name TEXT NOT NULL,
        action TEXT NOT NULL,
        stream TEXT,
        records_count INTEGER DEFAULT 0,
        error TEXT,
        degraded INTEGER DEFAULT 0,
        org_id TEXT NOT NULL,
        timestamp TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_audit_connector ON connector_audit_log(connector_id, timestamp);
      CREATE INDEX IF NOT EXISTS idx_audit_org ON connector_audit_log(org_id);
    `);
  }

  /** Record an audit entry */
  record(entry: AuditEntry): void {
    this.db.prepare(
      `INSERT INTO connector_audit_log (connector_id, connector_name, action, stream, records_count, error, degraded, org_id, timestamp)
       VALUES (?,?,?,?,?,?,?,?,?)`
    ).run(
      entry.connectorId, entry.connectorName, entry.action,
      entry.stream || null, entry.recordsCount || 0,
      entry.error || null, entry.degraded ? 1 : 0,
      entry.orgId, entry.timestamp || new Date().toISOString(),
    );
  }

  /** Query audit log for a connector */
  query(connectorId: string, limit = 50): AuditEntry[] {
    return this.db.prepare(
      'SELECT * FROM connector_audit_log WHERE connector_id=? ORDER BY timestamp DESC LIMIT ?'
    ).all(connectorId, limit) as AuditEntry[];
  }

  /** Get error rate for a connector (last 24h) */
  errorRate(connectorId: string): { total: number; errors: number; rate: number } {
    const since = new Date(Date.now() - 86400000).toISOString();
    const total = (this.db.prepare(
      'SELECT COUNT(*) as c FROM connector_audit_log WHERE connector_id=? AND timestamp > ?'
    ).get(connectorId, since) as { c: number }).c;
    const errors = (this.db.prepare(
      "SELECT COUNT(*) as c FROM connector_audit_log WHERE connector_id=? AND action='error' AND timestamp > ?"
    ).get(connectorId, since) as { c: number }).c;
    return { total, errors, rate: total > 0 ? errors / total : 0 };
  }

  /** Get recent activity across all connectors */
  recentActivity(limit = 20): AuditEntry[] {
    return this.db.prepare(
      'SELECT * FROM connector_audit_log ORDER BY timestamp DESC LIMIT ?'
    ).all(limit) as AuditEntry[];
  }
}

// ═══ Singleton ═══

let _auditLog: ConnectorAuditLog | null = null;

export function getConnectorAuditLog(db?: Database.Database): ConnectorAuditLog {
  if (!_auditLog && db) _auditLog = new ConnectorAuditLog(db);
  if (!_auditLog) throw new Error('ConnectorAuditLog 未初始化 — 首次调用需提供 database');
  return _auditLog;
}
