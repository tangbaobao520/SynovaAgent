/**
 * security/index.ts — 安全模块统一入口 (Phase 3)
 *
 * PermissionPolicy + AuditLog + PIIScrubber + DataBoundary
 * 参考: OpenClaw agent-tools.policy.ts + audit-extra.sync.ts
 */
import Database from 'better-sqlite3';
import { createLogger } from '../logger';

const log = createLogger('security');

// ═══ PermissionPolicy ═══

export type PermissionAction = 'read' | 'write' | 'trigger' | 'admin';

export interface PermissionCheck {
  orgId: string;
  action: PermissionAction;
  resource: string;
  userId?: string;
}

export class PermissionPolicy {
  private allowedOrgs: Set<string>;

  constructor(allowedOrgs: string[] = []) {
    this.allowedOrgs = new Set(allowedOrgs);
  }

  /** Check if an action is permitted */
  check(request: PermissionCheck): { allowed: boolean; reason?: string } {
    // orgId must always be present
    if (!request.orgId) {
      return { allowed: false, reason: '缺少 orgId' };
    }

    // All actions require orgId to be in allowed list (if configured)
    if (this.allowedOrgs.size > 0 && !this.allowedOrgs.has(request.orgId)) {
      return { allowed: false, reason: `orgId "${request.orgId}" 不在白名单中` };
    }

    // admin actions restricted
    if (request.action === 'admin' && !request.userId) {
      return { allowed: false, reason: 'admin 操作需要 userId' };
    }

    return { allowed: true };
  }

  /** Add org to allowlist */
  allowOrg(orgId: string): void {
    this.allowedOrgs.add(orgId);
  }
}

// ═══ AuditLog ═══

export interface AuditEntry {
  id?: string;
  action: string;
  orgId: string;
  userId?: string;
  resource?: string;
  detail?: string;
  timestamp?: string;
  result: 'allowed' | 'denied';
}

export class AuditLog {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        org_id TEXT NOT NULL,
        user_id TEXT,
        resource TEXT,
        detail TEXT,
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        result TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_audit_org ON audit_log(org_id);
      CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log(timestamp);
    `);
  }

  /** Record an audit event */
  record(entry: AuditEntry): void {
    this.db.prepare(`
      INSERT INTO audit_log (id, action, org_id, user_id, resource, detail, timestamp, result)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.id || `audit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      entry.action, entry.orgId, entry.userId || null,
      entry.resource || null, entry.detail || null,
      entry.timestamp || new Date().toISOString(), entry.result,
    );
    log.debug({ action: entry.action, orgId: entry.orgId, result: entry.result }, '审计记录');
  }

  /** Query audit log */
  query(orgId: string, limit = 50): AuditEntry[] {
    return this.db.prepare(
      'SELECT * FROM audit_log WHERE org_id = ? ORDER BY timestamp DESC LIMIT ?',
    ).all(orgId, limit) as AuditEntry[];
  }
}

// ═══ PIIScrubber ═══

const PII_PATTERNS: Array<[RegExp, string]> = [
  [/1[3-9]\d{9}/g, '[PHONE]'],                     // 手机号
  [/\d{17}[\dXx]/g, '[ID]'],                        // 身份证
  [/[\w.-]+@[\w.-]+\.\w+/g, '[EMAIL]'],             // 邮箱
  [/\b\d{16,19}\b/g, '[CARD]'],                     // 银行卡
  [/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP]'],        // IP 地址
];

export class PIIScrubber {
  /** Scrub PII from text before sending to external LLM */
  static scrub(text: string): string {
    let result = text;
    for (const [pattern, replacement] of PII_PATTERNS) {
      result = result.replace(pattern, replacement);
    }
    return result;
  }

  /** Check if text contains PII */
  static containsPII(text: string): boolean {
    return PII_PATTERNS.some(([pattern]) => pattern.test(text));
  }
}

// ═══ DataBoundary ═══

export type DataClassification = 'public' | 'internal' | 'sensitive' | 'restricted';

export class DataBoundary {
  /** Classify data sensitivity */
  static classify(content: string): DataClassification {
    if (PIIScrubber.containsPII(content)) return 'restricted';
    if (content.match(/密码|password|secret|token|key/i)) return 'restricted';
    if (content.match(/工资|薪酬|salary|revenue|财务/i)) return 'sensitive';
    if (content.match(/组织架构|org.*chart|团队.*结构/i)) return 'internal';
    return 'public';
  }

  /** Check if data can be sent to external LLM */
  static canSendToLLM(content: string): boolean {
    const classification = DataBoundary.classify(content);
    return classification !== 'restricted';
  }
}
