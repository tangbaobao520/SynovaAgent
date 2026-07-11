/**
 * policy-engine.ts — ABAC 属性驱动权限引擎 (L5 安全基础设施)
 *
 * 基于 (role, dataLevel, SOI) 三元组的权限裁决。
 * 安全规范 §3.4 定义接口，§3.1 定义 SOI，§2.1 定义数据等级。
 *
 * 铁律24: catch + log + degraded — 不适用（纯逻辑无IO）
 * 铁律31: 降级信号传播 — evaluate 永不当掉, 异常返回默认Deny
 * 铁律38: 禁止 as any 类型断言
 */

// ═══ SOI 常量 — 安全规范 §3.1 ═══

/**
 * 10 条标准操作指令 (Standard Operation Instructions)
 */
export const StandardOperations = {
  GRAPH_TRAVERSE: 'graph.traverse',
  SENTINEL_COMPUTE: 'sentinel.compute',
  AGENT_PROACTIVE_ALERT: 'agent.proactive_alert',
  ONTOLOGY_WRITE: 'ontology.write',
  DIAGNOSIS_REPORT: 'diagnosis.report',
  DATA_EXPORT: 'data.export',
  DATA_DELETE: 'data.delete',
  KNOWLEDGE_UPLOAD: 'knowledge.upload',
  GA_CALIBRATE: 'ga.calibrate',
  ADMIN_CONFIGURE: 'admin.configure',
} as const;

/** SOI 字面量类型 */
export type Soi = (typeof StandardOperations)[keyof typeof StandardOperations];

/** 数据等级 — 安全规范 §2.1 */
export type DataLevel = 'S0' | 'S1' | 'S2' | 'S3' | 'S4';

// ═══ 接口定义 — 安全规范 §3.4 ═══

export interface AccessRequest {
  /** 请求者角色 */
  role: string;
  /** 请求的数据等级 */
  dataLevel: DataLevel;
  /** 请求的标准操作指令 */
  soi: string;
}

export interface PolicyDecision {
  /** true=允许, false=拒绝 */
  allow: boolean;
  /** 拒绝原因（allow=true 时不存在） */
  denyReason?: string;
}

export interface PolicyRule {
  /** 规则名称（唯一标识） */
  name: string;
  /** 优先级（数值越小越优先） */
  priority: number;
  /** 匹配条件 */
  match: {
    /** 匹配的角色列表，为空或undefined表示匹配任意角色 */
    roles?: string[];
    /** 匹配的数据等级列表 */
    dataLevels?: DataLevel[];
    /** 匹配的 SOI 列表 */
    sois?: string[];
    /** 是否是写类操作（用于分类匹配） */
    isWrite?: boolean;
    /** 是否是读类操作 */
    isRead?: boolean;
  };
  /** 裁决结果 */
  decision: 'allow' | 'deny';
}

// ═══ SOI 分类辅助 ═══

/** 写类操作 SOI 列表（数据修改/删除/配置） */
const WRITE_SOIS: readonly string[] = [
  StandardOperations.ONTOLOGY_WRITE,
  StandardOperations.DATA_DELETE,
  StandardOperations.ADMIN_CONFIGURE,
  StandardOperations.KNOWLEDGE_UPLOAD,
  StandardOperations.DATA_EXPORT,
  StandardOperations.GA_CALIBRATE,
  StandardOperations.AGENT_PROACTIVE_ALERT,
];

/** 读类操作 SOI 列表（数据读取/计算/报告） */
const READ_SOIS: readonly string[] = [
  StandardOperations.GRAPH_TRAVERSE,
  StandardOperations.SENTINEL_COMPUTE,
  StandardOperations.DIAGNOSIS_REPORT,
];

function isWriteSoi(soi: string): boolean {
  return WRITE_SOIS.includes(soi);
}

function isReadSoi(soi: string): boolean {
  return READ_SOIS.includes(soi);
}

// ═══ 内建规则 ═══

/**
 * 9 条内建策略规则。
 * 优先级 1-99，越小越优先。
 *
 * 顺序: deny 优先规则 → allow 规则 → 兜底 deny_default
 */
const BUILT_IN_RULES: PolicyRule[] = [
  {
    name: 'deny_ga_write',
    priority: 1,
    match: { roles: ['ga'], isWrite: true },
    decision: 'deny',
  },
  {
    name: 'deny_staff_sensitive',
    priority: 2,
    match: { roles: ['staff'], dataLevels: ['S3', 'S4'] },
    decision: 'deny',
  },
  {
    name: 'allow_boss_all',
    priority: 2,
    match: { roles: ['boss'] },
    decision: 'allow',
  },
  {
    name: 'allow_admin_all',
    priority: 3,
    match: { roles: ['admin'] },
    decision: 'allow',
  },
  {
    name: 'allow_manager_dept',
    priority: 4,
    match: { roles: ['manager'], dataLevels: ['S0', 'S1', 'S2'] },
    decision: 'allow',
  },
  {
    name: 'allow_liaison_read',
    priority: 5,
    match: { roles: ['liaison'], isRead: true },
    decision: 'allow',
  },
  {
    name: 'allow_ga_read',
    priority: 6,
    match: { roles: ['ga'], isRead: true, dataLevels: ['S0', 'S1', 'S2'] },
    decision: 'allow',
  },
  {
    name: 'allow_staff_own',
    priority: 7,
    match: { roles: ['staff'], dataLevels: ['S0', 'S1'] },
    decision: 'allow',
  },
  {
    name: 'deny_default',
    priority: 99,
    match: {},
    decision: 'deny',
  },
];

// ═══ 规则匹配器 ═══

function matchRule(rule: PolicyRule, req: AccessRequest): boolean {
  // 角色匹配
  if (rule.match.roles && rule.match.roles.length > 0) {
    if (!rule.match.roles.includes(req.role)) return false;
  }

  // 数据等级匹配
  if (rule.match.dataLevels && rule.match.dataLevels.length > 0) {
    if (!rule.match.dataLevels.includes(req.dataLevel as DataLevel)) return false;
  }

  // SOI 精确匹配
  if (rule.match.sois && rule.match.sois.length > 0) {
    if (!rule.match.sois.includes(req.soi)) return false;
  }

  // 写操作分类匹配
  if (rule.match.isWrite !== undefined) {
    if (rule.match.isWrite !== isWriteSoi(req.soi)) return false;
  }

  // 读操作分类匹配
  if (rule.match.isRead !== undefined) {
    if (rule.match.isRead !== isReadSoi(req.soi)) return false;
  }

  return true;
}

// ═══ PolicyEngine ═══

/**
 * PolicyEngine — ABAC 属性驱动权限引擎
 *
 * 使用 (role, dataLevel, SOI) 三元组进行权限裁决。
 * 内建 9 条规则，支持运行时自定义追加/删除规则。
 * 默认安全原则 OWD=Private — 无匹配规则时返回 Deny。
 */
export class PolicyEngine {
  private rules: PolicyRule[];

  constructor() {
    this.rules = [...BUILT_IN_RULES];
  }

  /**
   * 评估访问请求，返回权限裁决结果。
   *
   * @param req - 访问请求 (role, dataLevel, soi)
   * @returns PolicyDecision — {allow, denyReason?}
   *
   * 异常安全: 任何运行时异常均返回 {allow: false, denyReason: 'deny_error'}
   */
  evaluate(req: AccessRequest): PolicyDecision {
    try {
      // 按优先级升序遍历（优先级数值越小越优先）
      for (const rule of this.rules) {
        if (matchRule(rule, req)) {
          if (rule.decision === 'allow') {
            return { allow: true };
          }
          return { allow: false, denyReason: `deny_${rule.name}: ${rule.name}` };
        }
      }
      // OWD=Private: 无匹配规则时默认 Deny
      return { allow: false, denyReason: 'deny_default: 无匹配策略规则' };
    } catch {
      // 异常安全：任何错误都返回默认 Deny
      return { allow: false, denyReason: 'deny_error: 策略评估异常' };
    }
  }

  /**
   * 追加一条自定义规则。
   * 规则保持按优先级排序。
   */
  addRule(rule: PolicyRule): void {
    this.rules.push(rule);
    this.rules.sort((a, b) => a.priority - b.priority);
  }

  /**
   * 按名称移除一条规则。
   * @returns true=移除成功, false=规则不存在
   */
  removeRule(name: string): boolean {
    const len = this.rules.length;
    this.rules = this.rules.filter(r => r.name !== name);
    return this.rules.length < len;
  }
}
