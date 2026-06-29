/**
 * security/index.ts — 安全模块统一入口 (Phase 3)
 *
 * PermissionPolicy + AuditLog + PIIScrubber + DataBoundary
 * 参考: OpenClaw agent-tools.policy.ts + audit-extra.sync.ts
 */
import Database from 'better-sqlite3';
import { createLogger } from '@synova/logger';

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
  // 中国手机号
  [/1[3-9]\d{9}/g, '[PHONE]'],
  // P3-02: 国际电话号码
  [/\+\d{1,3}[\s-]?\d{1,14}[\s-]?\d{4,14}/g, '[INTL_PHONE]'],
  // 身份证
  [/\d{17}[\dXx]/g, '[ID]'],
  // L5 P1: 中国护照号 (E+8位数字 或 G+8位)
  [/[EG]\d{8}/g, '[PASSPORT]'],
  // L5 P1: 中国车牌号 (省份简称+A-Z+5位)
  [/[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤川青藏琼宁][A-Z][A-HJ-NP-Z0-9]{5}/g, '[LICENSE_PLATE]'],
  // 邮箱
  [/[\w.-]+@[\w.-]+\.\w+/g, '[EMAIL]'],
  // 银行卡 (16-19位)
  [/\b\d{16,19}\b/g, '[CARD]'],
  // P3-02: IP 地址 (仅匹配有效范围 0-255)
  [/\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g, '[IP]'],
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
