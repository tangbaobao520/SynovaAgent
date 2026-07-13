/**
 * src/tools/tool-registry.ts — D65+D68 Tool 注册表 + 原子性验证 + 权限门禁
 *
 * D65 基础: register/get/unregister/list/invoke
 * D68 扩展: validateAtomicity / invoke PolicyEngine 门禁 / getToolsBySkill / 审计日志
 *
 * 与 src/agent/tools.ts 的 ToolRegistry 不同：
 * 后者是对话引擎的工具系统（有 execute/toOpenAITools/executeParallel），
 * 前者是纯工具定义注册表 + 原子性验证 + 权限模型。
 * 两者独立运行，Phase 2 考虑整合。
 *
 * 设计原则:
 *   - 不改 D65 register/get 签名
 *   - validateAtomicity 纯函数 — 不依赖外部状态
 *   - PolicyEngine 拒绝不阻塞系统 — 返回错误对象而非 throw
 *   - 审计日志写入失败降级（fire-and-forget + log.warn）
 *   - 零 as any
 */
import { createLogger } from '@synova/logger';
import type { PolicyDecision } from '../security/policy-engine';
import type { AuditEntryInput } from '../l4/audit-store';

const log = createLogger('tools/registry');

// ═══ Types ═══

/** 工具定义 — D65 基础 + D68 原子性字段 */
export interface ToolDef {
  name: string;
  version: string;
  description: string;
  /** 工具执行函数（接收 params 返回结果） */
  fn: (params: Record<string, unknown>) => unknown;
  /** 输入参数 schema（字段名 → 类型描述） */
  inputSchema: Record<string, string>;
  /** 输出类型描述 */
  outputType: string;
  // ── D68 原子性验证字段（可选） ──
  /** 契约 ID（如 COMPUTE-BREAK-EVEN-v1），用于原子性条件1 */
  contractId?: string;
  /** 是否可独立测试，用于原子性条件2 */
  hasTests?: boolean;
  /** 复用此工具的 Skill 名称列表，用于原子性条件3 */
  skills?: string[];
}

/** 原子性验证结果 */
export interface AtomicityResult {
  /** 是否通过全部 3 项检查 */
  atomic: boolean;
  /** 各项检查详情 */
  checks: {
    hasContract: boolean;
    hasTests: boolean;
    reusedByMultiple: boolean;
  };
  /** 未通过项的说明 */
  details: string[];
}

/** 调用策略上下文 — 提交给 PolicyEngine 的三元组 */
export interface ToolPolicyContext {
  /** 请求者角色 */
  role: string;
  /** 请求的数据等级 */
  dataLevel: string;
  /** 请求的标准操作指令 */
  soi: string;
}

/** 调用日志条目 */
export interface ToolCallLogEntry {
  toolName: string;
  callerRole: string;
  soi: string;
  allowed: boolean;
  denyReason?: string;
  timestamp: string;
}

// ═══ PolicyEngine 类型（避免直接依赖 PolicyEngine 类） ═══

export interface ToolPolicyEngine {
  evaluate(req: { role: string; dataLevel: string; soi: string }): PolicyDecision;
}

// ═══ Registry ═══

export class ToolRegistry {
  private tools = new Map<string, ToolDef>();
  private policyEngine: ToolPolicyEngine | null = null;
  private auditStore: { write(entry: AuditEntryInput): Promise<string> } | null = null;

  /** 注册一个工具定义。同名时覆盖已有。 */
  register(tool: ToolDef): void {
    this.tools.set(tool.name, tool);
  }

  /** 按名称获取工具定义。不存在时返回 undefined。 */
  get(name: string): ToolDef | undefined {
    return this.tools.get(name);
  }

  /** 按名称注销工具。返回 true 表示实际删除。 */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /** 返回全部已注册工具。 */
  list(): ToolDef[] {
    return [...this.tools.values()];
  }

  // ═══ D68 扩展 ═══

  /**
   * 设置 PolicyEngine 实例（可选 — 未设置时跳过权限检查）。
   */
  setPolicyEngine(engine: ToolPolicyEngine): void {
    this.policyEngine = engine;
  }

  /**
   * 设置审计日志存储（可选 — 未设置时仅 log.warn）。
   */
  setAuditStore(store: { write(entry: AuditEntryInput): Promise<string> }): void {
    this.auditStore = store;
  }

  /**
   * 原子性验证 — 检查 3 项条件。
   *
   * 条件 1: 输入/输出契约明确（contractId 非空）
   * 条件 2: 可独立测试（hasTests === true）
   * 条件 3: 被至少 2 个 Skill 复用（skills.length >= 2）
   *
   * @param tool - 待验证的工具定义
   * @returns AtomicityResult — 每项检查的通过状态 + 说明
   *
   * 纯函数：输入确定则输出确定，不依赖外部状态。
   */
  static validateAtomicity(tool: ToolDef): AtomicityResult {
    const hasContract = typeof tool.contractId === 'string' && tool.contractId.length > 0;
    const hasTests = tool.hasTests === true;
    const reusedByMultiple = Array.isArray(tool.skills) && tool.skills.length >= 2;

    const details: string[] = [];
    if (!hasContract) details.push('缺少 contractId — 输入/输出契约不明确');
    if (!hasTests) details.push('hasTests 不为 true — 没有独立测试');
    if (!reusedByMultiple) {
      const count = Array.isArray(tool.skills) ? tool.skills.length : 0;
      details.push(`skills 引用数 (${count}) < 2 — 未被至少 2 个 Skill 复用`);
    }

    return {
      atomic: hasContract && hasTests && reusedByMultiple,
      checks: { hasContract, hasTests, reusedByMultiple },
      details,
    };
  }

  /**
   * 调用已注册的工具，带 PolicyEngine 权限门禁。
   *
   * @param name - 工具名称
   * @param params - 输入参数
   * @param policy - 可选的策略上下文（未提供时跳过权限检查）
   * @returns 工具执行结果，或 null（工具不存在），或 {error, denyReason}（权限拒绝）
   */
  invoke(name: string, params: Record<string, unknown>, policy?: ToolPolicyContext): unknown {
    const tool = this.tools.get(name);
    if (!tool) return null;

    // PolicyEngine 门禁
    if (policy && this.policyEngine) {
      const decision = this.policyEngine.evaluate({
        role: policy.role,
        dataLevel: policy.dataLevel,
        soi: policy.soi,
      });

      if (!decision.allow) {
        const logEntry: ToolCallLogEntry = {
          toolName: name,
          callerRole: policy.role,
          soi: policy.soi,
          allowed: false,
          denyReason: decision.denyReason,
          timestamp: new Date().toISOString(),
        };

        log.warn({ ...logEntry }, 'Tool 调用被 PolicyEngine 拒绝');

        // 异步写入审计日志（fire-and-forget，失败仅 log.warn）
        this.writeAuditLog(name, policy, decision.denyReason || 'unknown');

        return { error: 'POLICY_DENIED', denyReason: decision.denyReason };
      }
    }

    // 允许执行
    const result = tool.fn(params);

    return result;
  }

  /**
   * 按 Skill 名称反向查询所有被该 Skill 复用的工具。
   *
   * @param skillName - Skill 名称（如 'analyze-break-even'）
   * @returns 被该 Skill 复用的工具列表
   */
  getToolsBySkill(skillName: string): ToolDef[] {
    return [...this.tools.values()].filter(
      t => Array.isArray(t.skills) && t.skills.includes(skillName),
    );
  }

  /**
   * 异步写入审计日志（fire-and-forget）。
   */
  private writeAuditLog(toolName: string, policy: ToolPolicyContext, denyReason: string): void {
    if (!this.auditStore) return;

    const entry: AuditEntryInput = {
      orgId: 'synova',
      actorId: `role:${policy.role}`,
      actorRole: policy.role,
      action: `tool.invoke.deny`,
      targetType: 'tool',
      targetId: toolName,
      newValue: JSON.stringify({ soi: policy.soi, denyReason }),
    };

    this.auditStore.write(entry).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg }, '审计日志写入失败 — 降级');
    });
  }
}

/** 全局单例实例 */
export const toolRegistry = new ToolRegistry();
