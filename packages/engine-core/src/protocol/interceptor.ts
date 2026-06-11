// ProtocolInterceptor — 四层责任链 (GAP-9 重组)
// Phase 2A: L0 铁律 → L1 协议规则 → L2 Authority → L3 S1
//
// 责任链 (四层架构):
//   Cache → L0 Iron Laws → L1 Protocol Rules → L2 Authority → L3 S1 → LLM Judge → Fallback
//   (命中→短路)  (LOCK→短路)   (LOCK/BLOCK/WARN)  (LOCK/BLOCK/WARN)  (LOCK→短路)  (裁决)     (降级)
//
// 裁决逻辑:
//   LOCK    → 直接拦截，不可 override
//   BLOCK   → 检查 override 配额，无配额则拦截
//   WARN    → 触发 LLM 裁决
//   no match → 放行

import type {
  TeamProtocol,
  AgentMessage,
  CollaborationContext,
  SessionFragment,
  ProtocolViolation,
  ConstraintSeverity,
  ProtocolInterceptResult,
  ProtocolInspectResult,
  IncentiveHint,
} from './types';
import type { ProtocolInterceptorConfig, InterceptorStats } from './types';
import type { AuthorityProtocol, RoleAuthorityRule } from '../protocols';
import { RuleEngine } from './rule-engine';
import { LLMJudge } from './llm-judge';
import { RulingCache } from './cache';
import { CircuitBreaker } from './circuit-breaker';
import { createLogger } from '../infra/logger';

const log = createLogger('engine-server/protocol/interceptor');

/** S1 导入（B-07） */
let checkForbiddenCombinations: ((protocol: TeamProtocol) => {
  violations: Array<{ combination: { description: string }; severity: 'LOCK' | 'BLOCK' }>;
  count: number;
}) | null = null;

/** 共享工作区实例（B-08，V1.2暂不接入，保留接口） */
let sharedWorkspace: any = null;

/** 默认配置 */
const DEFAULT_CONFIG: ProtocolInterceptorConfig = {
  defaultMaxOverrides: 3,
  llmTimeoutMs: 2000,
  maxInterceptsPerSecond: 100,
  s1Enabled: true,
  s1IntervalMs: 30_000,
  s1QuickCheckEnabled: true,
};

export class ProtocolInterceptor {
  private ruleEngine: RuleEngine;
  private llmJudge: LLMJudge | null;
  private cache: RulingCache;
  private circuitBreaker: CircuitBreaker;
  private ws: any;
  private config: ProtocolInterceptorConfig;

  /** 每个会话的 override 使用计数 */
  private overrideCounts = new Map<string, number>();

  /** S1 节流（B-07） */
  private lastS1FullCheckTime = 0;

  /** S1 未就绪警告只打印一次 */
  private _s1WarningLogged = false;

  /** 内部统计 */
  private statsData: InterceptorStats = {
    totalIntercepts: 0,
    ruleMatches: 0,
    llmCalls: 0,
    fallbacks: 0,
    cacheHits: 0,
    cacheMisses: 0,
    locks: 0,
    blocks: 0,
    warns: 0,
    overrides: 0,
    circuitBreakerTrips: 0,
    s1Violations: 0,
  };

  constructor(config?: Partial<ProtocolInterceptorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.ruleEngine = config?.ruleEngine || new RuleEngine();
    this.llmJudge = config?.llmJudge || null;
    this.cache = config?.cache || new RulingCache();
    this.circuitBreaker = config?.circuitBreaker || new CircuitBreaker();
    this.ws = sharedWorkspace;

    // 尝试加载 S1（B-07）
    this.loadS1();

    // 监听熔断器状态变化
    this.circuitBreaker.onChange((from, to) => {
      if (to === 'OPEN') this.statsData.circuitBreakerTrips++;
    });

    // S3: 熔断触发 → M3 进化信号采集（通过依赖注入回调）
    this.circuitBreaker.onTrip(() => {
      try {
        this.config.onCollaborationEvent?.({
          timestamp: new Date().toISOString(),
          gapDimension: 'authority_governance',
          eventType: 'conflict',
          roles: { from: 'system', to: 'system' },
          data: {
            modeUsed: 'current',
            outcome: 'deadlocked',
            humanIntervention: true,
            durationMs: 0,
          },
        });
        console.info('[interceptor] S3熔断信号已记录到 M3 进化引擎');
      } catch (err) {
        console.warn(`[interceptor] S3熔断信号记录失败: ${(err as Error).message}`);
      }
    });
  }

  /**
   * intercept() — 消息进入 Agent 前的拦截
   *
   * 四层责任链 (GAP-9 重组，沈括 P0 #1 调序):
   *   1. Cache Check        → 命中则直接返回（短路）
   *   2. L0: Iron Laws      → 安全基线，始终生效，不可降级
   *   3. L2: Authority       → 结构化权限（canDo/needApprovalFor/mustNotDo）
   *   4. L1: Protocol Rules  → 按 6 缝隙当前值匹配 + WorkspaceCheck
   *   5. L3: S1 Quick Check  → 禁止组合，LOCK→拦截
   *   6. LLM Judge           → WARN 级走 LLM 语义裁决
   *   7. Fallback            → LLM 不可用时降级放行
   *
   * 调序理由：身份检查（谁可以做什么）应在行为检查（怎么做）之前。
   *   L2 mustNotDo → LOCK 短路，省去后续 L1 协议匹配开销。
   */
  async intercept(
    message: AgentMessage,
    protocol: TeamProtocol,
    context: CollaborationContext
  ): Promise<ProtocolInterceptResult> {
    this.statsData.totalIntercepts++;

    // ============================================================
    // Step 1: Cache Check
    // ============================================================
    const cacheKey = this.cache.buildKey(message, protocol, context);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.statsData.cacheHits++;
      return cached;
    }
    this.statsData.cacheMisses++;

    // ============================================================
    // Step 2: L0 — Iron Laws（安全基线）
    //   铁律始终生效，不可覆盖，不可降级
    // ============================================================
    const ironResult = this.ruleEngine.checkIronLaws(message);
    if (ironResult.matched) {
      this.statsData.ruleMatches++;
      const decision = await this.processViolations(
        ironResult.violations,
        message, protocol, context, cacheKey
      );
      if (decision) return decision;
    }

    // ============================================================
    // Step 3: L2 — Authority Check（结构化权限清单）
    //   身份检查优先：谁可以做什么（canDo/needApprovalFor/mustNotDo）
    //   mustNotDo → LOCK 短路，省去后续 L1 协议匹配开销
    // ============================================================
    const authViolations = this.checkAuthority(message, protocol, context);
    if (authViolations.length > 0) {
      const decision = await this.processViolations(
        authViolations,
        message, protocol, context, cacheKey
      );
      if (decision) return decision;
    }

    // ============================================================
    // Step 4: L1 — Protocol Rules（6 缝隙协议规则）
    //   行为检查：按协议当前值匹配对应规则
    //   包含 WorkspaceCheck (B-08): information_flow 缝隙下的工作区访问控制
    // ============================================================
    const ruleResult = this.ruleEngine.match(message, protocol);
    if (ruleResult.matched) {
      this.statsData.ruleMatches++;
      const decision = await this.processViolations(
        ruleResult.violations,
        message, protocol, context, cacheKey
      );
      if (decision) return decision;
    }

    // L1 扩展: Workspace Check（B-08）
    // 检查消息是否包含工作区操作意图，基于 routingMap 做灰度裁决
    if (this.ws) {
      const wsViolations = this.checkWorkspaceOperation(message, protocol, context);
      if (wsViolations.length > 0) {
        const decision = await this.processViolations(
          wsViolations,
          message, protocol, context, cacheKey
        );
        if (decision) return decision;
      }
    }

    // ============================================================
    // Step 5: L3 — S1 Quick Check（禁止组合）
    //   仅检查禁止组合（O(1)），不跑完整 S1 推演
    //   不依赖消息内容，只检查协议的当前值
    // ============================================================
    if (this.config.s1QuickCheckEnabled && checkForbiddenCombinations) {
      const s1QuickResult = checkForbiddenCombinations(protocol);
      if (s1QuickResult.count > 0) {
        this.statsData.s1Violations++;
        const lockViolations = s1QuickResult.violations.filter(v => v.severity === 'LOCK');
        if (lockViolations.length > 0) {
          const violations: ProtocolViolation[] = [{
            gapDimension: 'trust_incentive',
            severity: 'LOCK',
            clause: `S1 禁止组合: ${lockViolations.map(v => v.combination.description).join('; ')}`,
            suggestion: '请调整协议配置以消除硬逻辑矛盾',
          }];
          this.statsData.locks++;
          const result = this.buildResult(false, violations, 'rule');
          result.reason = `S1 不变式违反 (LOCK): ${lockViolations.map(v => v.combination.description).join('; ')}`;
          this.cache.set(cacheKey, result, protocol.version);
          return result;
        }
      }
    }

    // ============================================================
    // 全部通过 → 放行
    // ============================================================
    const passResult = this.buildResult(true, [], 'rule');
    this.cache.set(cacheKey, passResult, protocol.version);
    return passResult;
  }

  /**
   * 共享违规处理 — 消除各层重复的 LOCK/BLOCK/WARN 分发逻辑
   *
   * @returns ProtocolInterceptResult 如果需要短路返回；null 表示继续下一层
   */
  private async processViolations(
    violations: ProtocolViolation[],
    message: AgentMessage,
    protocol: TeamProtocol,
    context: CollaborationContext,
    cacheKey: string
  ): Promise<ProtocolInterceptResult | null> {
    if (violations.length === 0) return null;

    const severityPriority: Record<ConstraintSeverity, number> = { LOCK: 3, BLOCK: 2, WARN: 1 };
    const maxSev = violations.reduce((max, v) =>
      severityPriority[v.severity] > severityPriority[max.severity] ? v : max
    , violations[0]);

    // LOCK: 直接拦截，不可 override
    if (maxSev.severity === 'LOCK') {
      this.statsData.locks++;
      const result = this.buildResult(false, violations, 'rule');
      this.cache.set(cacheKey, result, protocol.version);
      return result;
    }

    // BLOCK: 检查 override 配额
    if (maxSev.severity === 'BLOCK') {
      this.statsData.blocks++;
      const used = this.getOverrideCount(context.sessionId);
      if (used < this.config.defaultMaxOverrides) {
        this.statsData.overrides++;
        this.overrideCounts.set(context.sessionId, used + 1);
        const result = this.buildResult(true, violations, 'rule');
        result.overridePriority = 50;
        result.maxOverrides = this.config.defaultMaxOverrides;
        result.reason = `override 放行 (${used + 1}/${this.config.defaultMaxOverrides}): ${violations.map(v => `[${v.severity}] ${v.clause}`).join('; ')}`;
        this.cache.set(cacheKey, result, protocol.version);
        return result;
      }
      const result = this.buildResult(false, violations, 'rule');
      result.reason = `override 配额已用尽 (${used}/${this.config.defaultMaxOverrides})`;
      this.cache.set(cacheKey, result, protocol.version);
      return result;
    }

    // WARN: 触发 LLM 裁决（短路：不继续后续层，直接进入 LLM 路径）
    if (maxSev.severity === 'WARN') {
      this.statsData.warns++;
      return this.llmPath(message, protocol, context, violations, cacheKey);
    }

    return null;
  }

  /**
   * L2: Authority 权限检查（GAP-3 激活）
   *
   * 检查消息发送方角色是否有权限执行消息中的操作。
   * 基于 AuthorityProtocol.roleRules 的三元组：canDo / needApprovalFor / mustNotDo
   *
   * 判定逻辑：
   *   mustNotDo 命中       → LOCK（硬阻止）
   *   needApprovalFor 命中  → BLOCK（需审批，无审批则拦截）
   *   canDo 命中           → 放行
   *   globalForbidden 命中  → LOCK
   *   未知操作（不在任何列表）→ WARN
   */
  private checkAuthority(
    message: AgentMessage,
    protocol: TeamProtocol,
    _context: CollaborationContext
  ): ProtocolViolation[] {
    const authority = protocol.gaps.authorityGovernance as AuthorityProtocol | undefined;
    if (!authority) return [];

    const violations: ProtocolViolation[] = [];
    const senderRole = message.from;

    // —— 结构化角色规则检查 (GAP-3) ——
    const roleRules: RoleAuthorityRule[] = authority.roleRules || [];
    if (roleRules.length > 0) {
      const senderRule = roleRules.find(r => r.roleId === senderRole || r.roleName === senderRole);
      const operations = this.extractOperations(message);

      if (senderRule) {
        for (const op of operations) {
          // mustNotDo → LOCK
          if (senderRule.mustNotDo.some(f => this.operationMatches(op, f))) {
            violations.push({
              gapDimension: 'authority_governance',
              severity: 'LOCK',
              clause: `AUTH-L2: ${senderRole} 禁止执行 ${op}（mustNotDo 清单）`,
              suggestion: `操作 "${op}" 在角色 ${senderRole} 的禁止清单中，不可执行`,
            });
            continue;
          }

          // needApprovalFor → BLOCK（需人工审批）
          if (senderRule.needApprovalFor.some(f => this.operationMatches(op, f))) {
            const hasApproval = this.hasApprovalInMessage(message);
            if (!hasApproval) {
              violations.push({
                gapDimension: 'authority_governance',
                severity: 'BLOCK',
                clause: `AUTH-L2: ${senderRole} 执行 ${op} 需要审批（needApprovalFor 清单）`,
                suggestion: `操作 "${op}" 需要人工审批。请通过 escalation 渠道获取批准后重试`,
              });
            }
            continue;
          }

          // canDo → 放行（不生成 violation）
          if (senderRule.canDo.some(f => this.operationMatches(op, f))) {
            continue;
          }

          // 不在任何清单中 → WARN（未知操作）
          violations.push({
            gapDimension: 'authority_governance',
            severity: 'WARN',
            clause: `AUTH-L2: ${senderRole} 的操作 ${op} 不在 canDo/needApprovalFor/mustNotDo 任何清单中`,
            suggestion: `未知操作 "${op}"——建议在 Authority 协议中明确定义此操作的权限归属`,
          });
        }
      } else {
        // 发送方角色未在 roleRules 中注册
        if (operations.length > 0) {
          violations.push({
            gapDimension: 'authority_governance',
            severity: 'WARN',
            clause: `AUTH-L2: 角色 ${senderRole} 未在 Authority 协议的 roleRules 中注册`,
            suggestion: `请为角色 ${senderRole} 配置权限规则（canDo/needApprovalFor/mustNotDo）`,
          });
        }
      }
    }

    // —— 全局禁止规则检查 ——
    const globalForbidden = authority.globalForbidden || [];
    for (const rule of globalForbidden) {
      const msgLower = message.content.toLowerCase();
      if (msgLower.includes(rule.operation.toLowerCase())) {
        violations.push({
          gapDimension: 'authority_governance',
          severity: 'LOCK',
          clause: `AUTH-L2: 全局禁止操作 "${rule.operation}"`,
          suggestion: rule.reason || '此操作已被全局禁止',
        });
      }
    }

    return violations;
  }

  /**
   * 从消息内容中提取操作关键词
   * 解析消息中的动词-名词对，匹配已知操作模式
   */
  private extractOperations(message: AgentMessage): string[] {
    const operations: string[] = [];
    const content = message.content;

    // 消息 type 直接映射为操作
    if (message.type === 'task' || message.type === 'command') {
      const words = content.toLowerCase().split(/[\s,，、.。:：;；!！?？]+/).filter(w => w.length >= 2);
      // 提取动词-名词组合（如 "delete file", "modify config", "send email"）
      for (let i = 0; i < words.length - 1; i++) {
        const bigram = `${words[i]} ${words[i + 1]}`;
        if (this.isKnownOperation(bigram)) {
          operations.push(bigram);
        }
      }
      // 单动词也作为候选
      for (const w of words) {
        if (this.isKnownOperation(w)) {
          operations.push(w);
        }
      }
    }

    // 没有提取到操作时，用消息 type 作为 fallback
    if (operations.length === 0) {
      operations.push(message.type);
    }

    return operations;
  }

  /** 已知操作关键词集合 */
  private isKnownOperation(word: string): boolean {
    const knownOps = [
      'delete', 'modify', 'create', 'send', 'write', 'read', 'execute',
      'deploy', 'approve', 'reject', 'configure', 'install', 'uninstall',
      'export', 'import', 'share', 'publish', 'call', 'invoke', 'access',
      'call_external_api', 'send_email', 'modify_agent_config',
      'delete_team_artifact', 'write_outside_teamdir',
    ];
    return knownOps.includes(word.toLowerCase());
  }

  /** 检查消息中是否包含审批凭证 */
  private hasApprovalInMessage(message: AgentMessage): boolean {
    const approvalMarkers = ['[APPROVED]', '[AUTHORIZED]', 'approval_id:', 'approved_by:'];
    return approvalMarkers.some(m =>
      message.content.includes(m) || (message.metadata?.approvalId as string)?.length > 0
    );
  }

  /** 操作名称模糊匹配（支持通配符和子串匹配） */
  private operationMatches(actual: string, pattern: string): boolean {
    const a = actual.toLowerCase();
    const p = pattern.toLowerCase();
    if (p.includes('*')) {
      const regex = new RegExp('^' + p.replace(/\*/g, '.*') + '$');
      return regex.test(a);
    }
    return a.includes(p) || p.includes(a);
  }

  /**
   * inspect() — 消息离开 Agent 后的异步检查（B-07 升级）
   *
   * 追加 S1 完整推演（节流执行）
   */
  async inspect(
    response: AgentMessage,
    protocol: TeamProtocol,
    sessionLog: SessionFragment[]
  ): Promise<ProtocolInspectResult> {
    const violations: ProtocolViolation[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];

    // L0: 铁律检查
    const ironResult = this.ruleEngine.checkIronLaws(response);
    if (ironResult.matched) {
      violations.push(...ironResult.violations);
    }

    // L1: 协议规则匹配
    const ruleResult = this.ruleEngine.match(response, protocol);
    if (ruleResult.matched) {
      violations.push(...ruleResult.violations);
    }

    // 检查 session 级别的异常模式
    const fragmentCount = sessionLog.length;
    const totalMessages = sessionLog.reduce((sum, f) => sum + f.messages.length, 0);

    // 异常：某个角色长时间未发言
    const now = Date.now();
    const SESSION_TIMEOUT_MS = 300_000; // 5 分钟
    for (const fragment of sessionLog) {
      if (fragment.endTime && now - fragment.endTime > SESSION_TIMEOUT_MS) {
        warnings.push(`角色 ${fragment.roleId || '?'} 超过 5 分钟未发言——可能存在死锁或响应中断`);
      }
    }

    // ============================================================
    // L3: S1 完整推演（节流：每 s1IntervalMs 最多一次）
    // ============================================================
    if (this.config.s1Enabled && checkForbiddenCombinations) {
      const timeSinceLastCheck = now - this.lastS1FullCheckTime;
      const intervalMs = this.config.s1IntervalMs || 30_000;

      if (timeSinceLastCheck >= intervalMs) {
        this.lastS1FullCheckTime = now;

        const s1Result = checkForbiddenCombinations(protocol);
        if (s1Result.count > 0) {
          this.statsData.s1Violations++;
          for (const v of s1Result.violations) {
            violations.push({
              gapDimension: 'trust_incentive',
              severity: v.severity,
              clause: `S1 不变式: ${v.combination.description}`,
              suggestion: v.severity === 'LOCK' ? '协议存在硬逻辑矛盾，建议立即调整' : '建议调整协议以减少运行时冲突',
            });
          }
        }

        if (totalMessages > 100) {
          recommendations.push('S1: 消息量较大，建议触发完整可达性推演（CLI: --s1）以验证长期演化稳定性');
        }
      }
    }

    // 建议
    if (violations.filter(v => v.severity === 'LOCK').length > 0) {
      recommendations.push('检测到 LOCK 级违规，建议立即反馈治理检查者');
    }
    if (violations.length > 0) {
      recommendations.push('检测到违规消息，建议反馈学习者生成复盘报告');
    }
    if (totalMessages > 50 && fragmentCount >= 7) {
      recommendations.push('会话消息量较大，建议在 session 结束后触发协议演化分析');
    }

    return {
      passed: violations.filter(v => v.severity === 'LOCK').length === 0,
      violations,
      warnings,
      recommendations,
      incentiveHints: this.buildInspectIncentiveHints(violations, warnings, fragmentCount, totalMessages),
    };
  }

  /**
   * P1 LITE: inspect 端的激励建议（只关注正向的协作信号）
   */
  private buildInspectIncentiveHints(
    violations: ProtocolViolation[],
    warnings: string[],
    fragmentCount: number,
    totalMessages: number,
  ): IncentiveHint[] {
    const hints: IncentiveHint[] = [];

    const hasLock = violations.some(v => v.severity === 'LOCK');
    if (!hasLock && totalMessages > 10) {
      hints.push({
        hintType: 'positive_feedback',
        reason: `全程无 LOCK 违规，协作质量高（${totalMessages} 条消息，${fragmentCount} 个会话片段）`,
        targetRole: '',
      });
    }

    if (warnings.length === 0 && totalMessages > 20) {
      hints.push({
        hintType: 'reputation_boost',
        reason: '无结构性警告，协作效率优秀——建议提升此类团队模板的推荐优先级',
        targetRole: '',
      });
    }

    return hints;
  }

  /** 获取拦截器统计 */
  get stats(): InterceptorStats {
    return { ...this.statsData };
  }

  /** 重置统计 */
  resetStats(): void {
    this.statsData = {
      totalIntercepts: 0, ruleMatches: 0, llmCalls: 0, fallbacks: 0,
      cacheHits: 0, cacheMisses: 0, locks: 0, blocks: 0, warns: 0,
      overrides: 0, circuitBreakerTrips: 0, s1Violations: 0,
    };
  }

  // ============================================================
  // 内部
  // ============================================================

  /** 加载 S1 引擎（B-07，动态导入以防循环依赖） */
  private loadS1(): void {
    try {
      if (!checkForbiddenCombinations) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const s1 = require('../s1-deductive-engine.js');
        checkForbiddenCombinations = s1.checkForbiddenCombinations;
      }
    } catch (err: unknown) {
      checkForbiddenCombinations = null;
      if (!this._s1WarningLogged) {
        this._s1WarningLogged = true;
        console.info(`[interceptor] S1 演绎引擎未就绪 (${(err as Error).message})，L3 协议检查将跳过 S1 演绎推理`);
      }
    }
  }

  /**
   * 注入共享工作区实例（B-08）
   */
  setSharedWorkspace(ws: any): void {
    this.ws = ws;
  }

  /**
   * B-08: 工作区操作合规检查
   *
   * 检查消息是否包含对共享工作区的读写意图，并根据
   * information_flow 缝隙的 routingMap 进行灰度裁决。
   *
   * 判定策略（非一刀切）：
   *   1. 先查 routingMap 是否有显式路径 → 路径存在则放行
   *   2. 路径不存在 → 根据拓扑推导 severity:
   *      - star: LOCK | chain: >2跳→BLOCK | full_mesh: WARN | hierarchical: 跨层→BLOCK
   */
  private checkWorkspaceOperation(
    message: AgentMessage,
    protocol: TeamProtocol,
    _context: CollaborationContext
  ): ProtocolViolation[] {
    const infoFlow = protocol.gaps['information_flow'] as Record<string, unknown>;
    const routingMap = infoFlow['routingMap'] as Record<string, string[]> | undefined;
    const topology = (infoFlow['topology'] as string) || 'full_mesh';
    const visibilityMatrix = (infoFlow['visibilityMatrix'] as Record<string, string[]>) || {};

    const wsOp = this.parseWorkspaceIntent(message);
    if (!wsOp) return [];

    const allowedReaders = routingMap?.[wsOp.targetRole];
    if (allowedReaders && allowedReaders.includes(message.from)) {
      return [];
    }

    const severity = this.deriveWorkspaceSeverity(
      topology,
      message.from,
      wsOp.targetRole,
      visibilityMatrix,
      allowedReaders
    );

    const allowedList = allowedReaders || [];
    const suggestion = allowedList.length > 0
      ? `请通过 ${allowedList.join(' 或 ')} 中转读取 ${wsOp.targetRole} 的工作区产出`
      : `${topology} 拓扑下 ${message.from} 无权直接访问 ${wsOp.targetRole} 的工作区`;

    return [{
      gapDimension: 'information_flow',
      severity,
      clause: `IF-R3: ${message.from} 试图 ${wsOp.action} ${wsOp.targetRole} 的工作区资产 (${wsOp.targetAction || 'any'}${wsOp.assetId ? '/' + wsOp.assetId : ''})，但 routingMap 未授权直接访问`,
      suggestion,
    }];
  }

  /**
   * 从消息内容中解析工作区操作意图
   */
  private parseWorkspaceIntent(message: AgentMessage): {
    action: 'read' | 'write';
    targetRole: string;
    targetAction?: string;
    assetId?: string;
  } | null {
    if (message.type !== 'query') return null;
    const content = message.content.trim();

    const readMatch = content.match(/^ws\.read\s+(\S+)(?:\s+(\S+)(?:\s+(\S+))?)?\s*$/i);
    if (readMatch) {
      return {
        action: 'read',
        targetRole: readMatch[1],
        targetAction: readMatch[2] || undefined,
        assetId: readMatch[3] || undefined,
      };
    }

    const writeMatch = content.match(/^ws\.write\s+(\S+)\s+(\S+)\s*$/i);
    if (writeMatch) {
      return {
        action: 'write',
        targetRole: writeMatch[1],
        targetAction: writeMatch[2],
      };
    }

    return null;
  }

  /**
   * 按拓扑推导工作区操作违规的 severity
   */
  private deriveWorkspaceSeverity(
    topology: string,
    fromRole: string,
    targetRole: string,
    visibilityMatrix: Record<string, string[]>,
    _allowedReaders: string[] | undefined
  ): ConstraintSeverity {
    switch (topology) {
      case 'star':
        return 'LOCK';
      case 'chain': {
        const hops = this.estimateHops(fromRole, targetRole, visibilityMatrix);
        return hops > 2 ? 'BLOCK' : 'WARN';
      }
      case 'full_mesh':
        return 'WARN';
      case 'hierarchical': {
        const fromLayer = this.inferLayer(fromRole);
        const targetLayer = this.inferLayer(targetRole);
        if (fromLayer && targetLayer && Math.abs(fromLayer - targetLayer) > 1) {
          return 'BLOCK';
        }
        return 'WARN';
      }
      default:
        return 'WARN';
    }
  }

  /**
   * 估算链式拓扑中两角色间的跳数（BFS）
   */
  private estimateHops(
    from: string,
    to: string,
    visibilityMatrix: Record<string, string[]>
  ): number {
    const visited = new Set<string>();
    const queue: Array<{ role: string; hops: number }> = [{ role: from, hops: 0 }];

    while (queue.length > 0) {
      const { role, hops } = queue.shift()!;
      if (role === to) return hops;
      if (visited.has(role)) continue;
      visited.add(role);

      const neighbors = visibilityMatrix[role] || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          queue.push({ role: neighbor, hops: hops + 1 });
        }
      }
    }

    return Infinity;
  }

  /**
   * 推断角色所属治理层级
   */
  private inferLayer(roleId: string): number | null {
    const L1 = ['scenario-parser', 'orchestrator'];
    const L2 = ['philosophy-aligner', 'decision-simulator', 'expert-advisor'];
    const L3 = ['governance-checker', 'reflective-learner'];

    if (L1.includes(roleId)) return 1;
    if (L2.includes(roleId)) return 2;
    if (L3.includes(roleId)) return 3;
    return null;
  }

  /** LLM 裁决路径 */
  private async llmPath(
    message: AgentMessage,
    protocol: TeamProtocol,
    context: CollaborationContext,
    violations: ProtocolViolation[],
    cacheKey: string
  ): Promise<ProtocolInterceptResult> {
    if (!this.circuitBreaker.allowRequest()) {
      return this.fallbackPath(violations, cacheKey, protocol.version, '熔断器开启');
    }

    if (!this.llmJudge) {
      return this.fallbackPath(violations, cacheKey, protocol.version, 'LLM 未配置');
    }

    this.statsData.llmCalls++;

    // S2: LLM Judge 调用事件 → 进化信号采集
    this.config.onCollaborationEvent?.({
      timestamp: new Date().toISOString(),
      gapDimension: violations[0]?.gapDimension || 'information_flow',
      eventType: 'conflict',
      roles: { from: message.from, to: message.to },
      data: {
        modeUsed: protocol.mode || 'current',
        outcome: 'escalated',
        humanIntervention: false,
        durationMs: 0,
      },
    });

    try {
      const gap = violations[0]?.gapDimension || 'information_flow';
      const llmResult = await this.llmJudge.judge(message, gap, protocol);

      this.circuitBreaker.recordSuccess();

      if (!llmResult) {
        this.config.onCollaborationEvent?.({
          timestamp: new Date().toISOString(),
          gapDimension: violations[0]?.gapDimension || 'information_flow',
          eventType: 'conflict',
          roles: { from: message.from, to: message.to },
          data: {
            modeUsed: protocol.mode || 'current',
            outcome: 'deadlocked',
            humanIntervention: true,
            durationMs: 0,
          },
        });
        return this.fallbackPath(violations, cacheKey, protocol.version, 'LLM 解析失败');
      }

      if (llmResult.isViolation) {
        const severity = llmResult.severity;
        const result = this.buildResult(false, violations, 'llm');
        result.reason = `LLM 裁决确认违规 (confidence: ${llmResult.confidence.toFixed(2)}): ${llmResult.reason}`;
        if (severity === 'BLOCK') {
          const used = this.getOverrideCount(context.sessionId);
          if (used < this.config.defaultMaxOverrides) {
            result.passed = true;
            result.overridePriority = 30;
          }
        }
        this.cache.set(cacheKey, result, protocol.version);
        return result;
      }

      const result = this.buildResult(true, violations, 'llm');
      result.reason = `LLM 裁决确认无违规 (confidence: ${llmResult.confidence.toFixed(2)})`;
      this.cache.set(cacheKey, result, protocol.version);
      return result;

    } catch {
      log.warn('[interceptor] LLM judgment failed, using fallback path');
      this.circuitBreaker.recordFailure();
      this.config.onCollaborationEvent?.({
        timestamp: new Date().toISOString(),
        gapDimension: violations[0]?.gapDimension || 'information_flow',
        eventType: 'conflict',
        roles: { from: message.from, to: message.to },
        data: {
          modeUsed: protocol.mode || 'current',
          outcome: 'deadlocked',
          humanIntervention: true,
          durationMs: 0,
        },
      });
      return this.fallbackPath(violations, cacheKey, protocol.version, 'LLM 调用失败');
    }
  }

  /** 降级路径 */
  private fallbackPath(
    violations: ProtocolViolation[],
    _cacheKey: string,
    _protocolVersion: number,
    reason: string
  ): ProtocolInterceptResult {
    this.statsData.fallbacks++;
    const result = this.buildResult(true, violations, 'fallback');
    result.reason = `降级放行: ${reason}`;
    return result;
  }

  /** 构造 InterceptResult */
  private buildResult(
    passed: boolean,
    violations: ProtocolViolation[],
    source: 'rule' | 'llm' | 'fallback'
  ): ProtocolInterceptResult {
    return {
      passed,
      violations,
      maxOverrides: this.config.defaultMaxOverrides,
      overridePriority: passed ? 0 : 100,
      reason: violations.length > 0
        ? violations.map(v => `[${v.severity}] ${v.clause}`).join('; ')
        : '无违规',
      source,
    };
  }

  /**
   * P1 LITE: 从裁决结果提取正向激励建议
   */
  private buildIncentiveHints(
    allowed: boolean,
    violations: ProtocolViolation[],
  ): IncentiveHint[] {
    const hints: IncentiveHint[] = [];

    if (allowed) {
      if (violations.length === 0) {
        hints.push({
          hintType: 'positive_feedback',
          reason: '消息合规通过，协作行为符合当前协议',
          targetRole: '',
        });
      } else if (violations.length <= 2) {
        hints.push({
          hintType: 'positive_feedback',
          reason: '虽触发警告但协作意图正确，协议容忍度内放行',
          targetRole: '',
        });
      }
    }

    const uniqueGaps = new Set(violations.map(v => v.gapDimension).filter(Boolean));
    if (uniqueGaps.size >= 3 && allowed) {
      hints.push({
        hintType: 'priority_boost',
        reason: `跨 ${uniqueGaps.size} 个缝隙维度的高质量协作（${[...uniqueGaps].join('、')}）`,
        targetRole: '',
      });
    }

    return hints;
  }

  /** 获取会话的 override 已用次数 */
  private getOverrideCount(sessionId: string): number {
    return this.overrideCounts.get(sessionId) || 0;
  }
}
