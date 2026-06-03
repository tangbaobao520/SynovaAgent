/**
 * diagnosis-permissions.ts — 诊断代理 7 层权限决策树
 *
 * 对标 Claw-Code permissions.rs:
 *   - PermissionPolicy 结构体 + builder 模式
 *   - 7 层决策树（EVERYONE → NEVER）
 *   - 规则覆盖机制（deny > allow）
 *   - RecordingPermissionStore 用于测试断言
 *
 * 层级语义：
 *   EVERYONE(0)            — 公开诊断摘要、行业基准
 *   ORG_MEMBER(1)          — 同组织成员可见脱敏诊断
 *   DIAGNOSIS_PARTICIPANT(2) — 诊断参与者可见本阶段证据
 *   INITIATOR_ONLY(3)      — 仅发起人可见完整报告
 *   FDE_OVERRIDE(4)        — FDE 可覆盖 PARTICIPANT 限制
 *   ADMIN_ONLY(5)          — 仅系统管理员可见
 *   NEVER(6)               — 永不暴露（密钥、个人身份信息）
 */

import {
  DiagnosisPermissionLevel,
  PermissionContext,
  PermissionResult,
  DiagnosisEvidence,
} from './types';

// ====================================================================
// 权限规则
// ====================================================================

/** 权限规则操作 */
type RuleAction = 'allow' | 'deny';

/** 单条权限规则 */
export interface PermissionRule {
  /** 规则名（用于审计日志） */
  name: string;
  /** 匹配的资源名（工具名、证据 ID 前缀、报告类型） */
  resourcePattern: string;
  /** 允许或拒绝 */
  action: RuleAction;
  /** 最低所需权限等级 */
  minLevel: DiagnosisPermissionLevel;
  /** 规则优先级——更高数字优先匹配 */
  priority: number;
}

/** 权限检查请求 */
export interface PermissionRequest {
  /** 被访问的资源名 */
  resource: string;
  /** 请求者上下文 */
  context: PermissionContext;
  /** 请求的操作 */
  action: 'read' | 'write' | 'delete';
}

// ====================================================================
// PermissionPolicy
// ====================================================================

/** 权限策略——7 层决策树引擎 */
export class PermissionPolicy {
  private rules: PermissionRule[] = [];

  /** 添加规则（builder 模式，对标 Claw-Code #[must_use] with_*） */
  withRule(rule: PermissionRule): this {
    this.rules.push(rule);
    return this;
  }

  /** 批量添加规则 */
  withRules(rules: PermissionRule[]): this {
    for (const r of rules) this.rules.push(r);
    return this;
  }

  /** 移除指定名称的规则 */
  withoutRule(name: string): this {
    this.rules = this.rules.filter(r => r.name !== name);
    return this;
  }

  /**
   * 执行权限检查。
   *
   * 决策顺序（对标 Claw-Code 7 层决策树）：
   *   1. 资源级规则优先匹配（deny > allow）
   *   2. 无匹配规则时，按请求者最高权限等级 fallback
   *   3. FDE 可覆盖 PARTICIPANT 级限制
   */
  check(request: PermissionRequest): PermissionResult {
    // Step 1: 资源级规则匹配（优先级降序）
    const matched = this.rules
      .filter(r => this.matchResource(r.resourcePattern, request.resource))
      .sort((a, b) => b.priority - a.priority);

    if (matched.length > 0) {
      // deny 优先——一条 deny 即可拒绝
      const denyRule = matched.find(r => r.action === 'deny');
      if (denyRule) {
        const requesterLevel = this.effectiveLevel(request.context);
        if (requesterLevel < denyRule.minLevel) {
          return {
            allowed: false,
            reason: `${request.resource}: 规则 "${denyRule.name}" 拒绝访问（需 ≥${DiagnosisPermissionLevel[denyRule.minLevel]}）`,
            suggestedAction: '联系诊断发起人提升权限',
          };
        }
      }

      // 所有匹配的 deny 都被 override → allow
      const allowRule = matched.find(r => r.action === 'allow');
      if (allowRule) {
        const requesterLevel = this.effectiveLevel(request.context);
        if (requesterLevel >= allowRule.minLevel) {
          return { allowed: true };
        }
      }
    }

    // Step 2: 默认 fallback——按资源类型映射最低权限
    const defaultMinLevel = this.defaultLevelForResource(request.resource, request.action);
    const requesterLevel = this.effectiveLevel(request.context);

    if (requesterLevel >= defaultMinLevel) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: `${request.resource}: 默认权限不足（需 ≥${DiagnosisPermissionLevel[defaultMinLevel]}，当前 ${DiagnosisPermissionLevel[requesterLevel]}）`,
      suggestedAction: '加入诊断参与者列表或请求发起人授权',
    };
  }

  /** 检查单条证据是否可读 */
  canReadEvidence(evidence: DiagnosisEvidence, context: PermissionContext): PermissionResult {
    // NEVER: 标记为私有的证据 + 请求者非发起人 → 拒绝
    if (evidence.isPrivate && !context.isInitiator && !context.isFDE) {
      return {
        allowed: false,
        reason: `证据 ${evidence.id}: 标记为私有（${evidence.privateReason ?? '未说明原因'}）`,
        suggestedAction: '联系诊断发起人请求脱敏版本',
      };
    }
    return this.check({
      resource: `evidence:${evidence.dimension}`,
      context,
      action: 'read',
    });
  }

  /** 批量过滤可读证据 */
  filterReadableEvidence(
    evidenceList: DiagnosisEvidence[],
    context: PermissionContext,
  ): { readable: DiagnosisEvidence[]; denied: string[] } {
    const readable: DiagnosisEvidence[] = [];
    const denied: string[] = [];
    for (const ev of evidenceList) {
      const result = this.canReadEvidence(ev, context);
      if (result.allowed) {
        readable.push(ev);
      } else {
        denied.push(ev.id);
      }
    }
    return { readable, denied };
  }

  // ── 内部方法 ──

  /** 计算请求者有效权限等级（FDE 可获 +1 提升） */
  private effectiveLevel(context: PermissionContext): DiagnosisPermissionLevel {
    const base = this.baseLevel(context);
    // FDE 可覆盖 PARTICIPANT 级限制（对标 FDE_OVERRIDE）
    if (context.isFDE && base < DiagnosisPermissionLevel.FDE_OVERRIDE) {
      return DiagnosisPermissionLevel.FDE_OVERRIDE;
    }
    return base;
  }

  /** 根据角色计算基础权限等级 */
  private baseLevel(context: PermissionContext): DiagnosisPermissionLevel {
    if (context.isInitiator) return DiagnosisPermissionLevel.INITIATOR_ONLY;
    // 同团队 → ORG_MEMBER，跨团队 → EVERYONE
    if (context.requesterTeamId === context.targetTeamId) {
      return DiagnosisPermissionLevel.ORG_MEMBER;
    }
    return DiagnosisPermissionLevel.EVERYONE;
  }

  /** 简单 glob 匹配（支持 * 通配符和精确匹配） */
  private matchResource(pattern: string, resource: string): boolean {
    if (pattern === '*' || pattern === resource) return true;
    if (pattern.endsWith('*')) {
      return resource.startsWith(pattern.slice(0, -1));
    }
    if (pattern.startsWith('*')) {
      return resource.endsWith(pattern.slice(1));
    }
    return false;
  }

  /** 资源 → 默认最低权限等级 */
  private defaultLevelForResource(
    resource: string,
    action: 'read' | 'write' | 'delete',
  ): DiagnosisPermissionLevel {
    // 写入/删除操作 → 至少 INITIATOR_ONLY
    if (action === 'write' || action === 'delete') {
      return DiagnosisPermissionLevel.INITIATOR_ONLY;
    }
    // 完整报告 → INITIATOR_ONLY
    if (resource.startsWith('report:') || resource === 'full-report') {
      return DiagnosisPermissionLevel.INITIATOR_ONLY;
    }
    // 诊断摘要 → ORG_MEMBER
    if (resource.startsWith('summary:') || resource === 'diagnosis-summary') {
      return DiagnosisPermissionLevel.ORG_MEMBER;
    }
    // 行业基准 → EVERYONE
    if (resource.startsWith('benchmark:') || resource === 'industry-benchmark') {
      return DiagnosisPermissionLevel.EVERYONE;
    }
    // 证据 → PARTICIPANT
    if (resource.startsWith('evidence:')) {
      return DiagnosisPermissionLevel.DIAGNOSIS_PARTICIPANT;
    }
    // 默认 → ORG_MEMBER
    return DiagnosisPermissionLevel.ORG_MEMBER;
  }
}

// ====================================================================
// 内置规则集
// ====================================================================

/** 创建生产环境默认权限策略 */
export function createDefaultPermissionPolicy(): PermissionPolicy {
  return new PermissionPolicy()
    .withRule({
      name: 'public-benchmark',
      resourcePattern: 'benchmark:*',
      action: 'allow',
      minLevel: DiagnosisPermissionLevel.EVERYONE,
      priority: 10,
    })
    .withRule({
      name: 'org-summary-access',
      resourcePattern: 'summary:*',
      action: 'allow',
      minLevel: DiagnosisPermissionLevel.ORG_MEMBER,
      priority: 20,
    })
    .withRule({
      name: 'participant-evidence-access',
      resourcePattern: 'evidence:*',
      action: 'allow',
      minLevel: DiagnosisPermissionLevel.DIAGNOSIS_PARTICIPANT,
      priority: 30,
    })
    .withRule({
      name: 'initiator-full-report',
      resourcePattern: 'report:*',
      action: 'allow',
      minLevel: DiagnosisPermissionLevel.INITIATOR_ONLY,
      priority: 40,
    })
    .withRule({
      name: 'admin-all',
      resourcePattern: '*',
      action: 'allow',
      minLevel: DiagnosisPermissionLevel.ADMIN_ONLY,
      priority: 100,
    });
}

// ====================================================================
// 测试 Spy（对标 Claw-Code RecordingPrompter）
// ====================================================================

/** 记录型权限存储——测试中用于断言权限检查调用 */
export class RecordingPermissionStore {
  seen: PermissionRequest[] = [];

  check(req: PermissionRequest): PermissionResult {
    this.seen.push({ ...req });
    return { allowed: true };
  }

  /** 最近一次请求 */
  lastRequest(): PermissionRequest | undefined {
    return this.seen[this.seen.length - 1];
  }

  /** 按资源名过滤 */
  requestsFor(resource: string): PermissionRequest[] {
    return this.seen.filter(r => r.resource === resource);
  }

  reset(): void {
    this.seen = [];
  }
}
