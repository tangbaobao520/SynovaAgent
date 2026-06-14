/**
 * diagnosis-orchestrator.ts — 六阶段诊断编排器
 *
 * 对标 Claw-Code conversation.rs 的 ConversationRuntime<C, T>:
 *   - 泛型工具执行器接口 (ToolExecutor trait)
 *   - 泛型 LLM 客户端接口 (ApiClient trait)
 *   - Builder 模式 (with_* 方法，对标 #[must_use])
 *   - 状态机驱动的 turn 循环
 *
 * 六阶段：
 *   Phase 0 (界定) → 结构化卡片问卷，确定性
 *   Phase 1 (采集) → runModules() 并行计算，确定性
 *   Phase 2 (假设) → 证据池 → LLM 生成 3-5 个假设
 *   Phase 3 (根因) → 规则引擎 + 矛盾检测，确定性
 *   Phase 4 (报告) → 模板渲染，确定性
 *   Phase 5 (交付) → LLM 行动建议 + 推送外部系统
 */

import {
  InitiatorProfile,
  DiagnosisScope,
  DiagnosisEvidence,
  DiagnosisHypothesis,
  RootCauseTree,
  RootCause,
  CausalChain,
  StructuredDiagnosisReport,
  DeliveryResult,
  ConsultationResult,
  DiagnosisEvent,
  DiagnosisErrorCode,
  AgentIterationState,
  ModuleFinding,
  ContradictionSignal,
  type StrategicPosture,
} from './types';
import { DiagnosisPromptBuilder, createScopePromptBuilder, createHypothesisPromptBuilder } from './diagnosis-prompt-builder';
import { PermissionPolicy, createDefaultPermissionPolicy } from './diagnosis-permissions';
import type { PermissionContext, PermissionResult } from './types';
import type { PermissionRequest } from './diagnosis-permissions';
import { RecoveryExecutor, createDefaultRecoveryExecutor, DiagnosisFailureScenario } from './diagnosis-recovery';
import { EvidenceManager } from './evidence-manager';
import { runModules, listModules, ensureModulesRegistered } from './module-registry';
import { getLatestSnapshot, GAP_DIMENSIONS } from './gap-recorder';
import { estimateMessageTokens } from './diagnosis-session';
import { detectPosture, defaultDetection } from './posture-detector';
import { loadPostureConfig, postureOpening, translateFinding, translateAction } from './posture-lens';
import { normalizeDiagnosisError } from './diagnosis-error';
import { DiagnosisHookMap } from './diagnosis-hook-map';
import type { BeforePhaseContext, AfterModuleContext, BeforeReportContext, BeforeToolCallContext } from './diagnosis-hook-map';
import { createInterviewProject, getProjectProgress } from './interview-project-manager';
import { shouldCompact, compactMessages } from './context-compressor';
import { appendMessage, createSession, compactSession } from './diagnosis-session-store';
import { runSecurityAudit, hasBlockingFindings } from './security-auditor';
import type { SecurityAuditContext } from './security-auditor';
// EC-02 Sprint A: 依赖 ExpertSubsystem 接口，不依赖具体类
import type { ExpertSubsystem } from './expert-subsystem-interface';
// EC-02 Sprint C: Phase 2 独立文件
import { phase2Hypothesize } from './phase2-hypothesize';
import { ExpertSubAgentExecutor, type ExpertSubAgentContext } from './expert-subagent-executor';
import { getDataAccessPolicy, filterEvidenceForExpert, anonymizeEvidence, getAllowedToolsForExpert } from './expert-data-policy';
import { renderKnowledgeForSystemPrompt } from './expert-knowledge';
import { buildExpertSystemPrompt } from './expert-prompts';
import { EXPERT_REPORT_SCHEMA } from './expert-subagent-executor';
import { synthesizeExpertReports } from './synthesizer';
import { saveExpertReport } from './expert-report-store';
import { extractSessionBrief } from './phase0-prompts';
import type { ExpertType, ExpertReport } from './types';
import type { ExpertContext } from './expert-subsystem-interface';
import { createLogger } from '../../infra/logger';
import { getEngineContext } from '../../engine-context';

const log = createLogger('diagnosis/orchestrator');

// ====================================================================
// 泛型接口（对标 Claw-Code traits）
// ====================================================================

/** LLM 响应 */
export interface LLMResponse {
  content: string;
  model: string;
}

/** LLM 客户端接口（对标 ApiClient trait） */
export interface DiagnosisLLMClient {
  consult(systemPrompt: string, userMessage: string): Promise<LLMResponse>;
}

/** 工具执行结果 */
export interface ToolResult {
  content: string;
}

/** 工具执行器接口（对标 ToolExecutor trait） */
export interface ToolExecutor {
  execute(toolName: string, input: string): Promise<ToolResult>;
}

// ====================================================================
// SessionTracer（对标 Claw-Code TelemetrySink）
// ====================================================================

/** 会话追踪器——收集诊断事件流 */
export interface SessionTracer {
  /** 记录事件 */
  trace(event: DiagnosisEvent): void;
  /** 获取全部事件 */
  events(): DiagnosisEvent[];
  /** 获取事件计数 */
  count(): number;
}

/** 内存会话追踪器实现（对标 MemoryTelemetrySink） */
export class MemorySessionTracer implements SessionTracer {
  private _events: DiagnosisEvent[] = [];

  trace(event: DiagnosisEvent): void {
    this._events.push(event);
  }

  events(): DiagnosisEvent[] {
    return [...this._events];
  }

  count(): number {
    return this._events.length;
  }
}

// ====================================================================
// DiagnosisOrchestrator<C, T>
// ====================================================================

/** 编排器配置 */
export interface OrchestratorConfig {
  maxIterations: number;
  /** Phase 1 数据完整性阈值 0-1（低于此值拒绝进入 Phase 2） */
  gateDataCompleteness: number;
  /** Phase 2 最低假设置信度 */
  gateMinHypothesisConfidence: number;
}

const DEFAULT_CONFIG: OrchestratorConfig = {
  maxIterations: 10,
  gateDataCompleteness: 0.8,
  gateMinHypothesisConfidence: 0.6,
};

/**
 * 诊断编排器——六阶段状态机。
 *
 * 对标 Claw-Code ConversationRuntime<C, T>:
 *   - C extends DiagnosisLLMClient
 *   - T extends ToolExecutor
 */
export class DiagnosisOrchestrator<
  C extends DiagnosisLLMClient,
  T extends ToolExecutor,
> {
  private config: OrchestratorConfig;
  private llmClient: C;
  private toolExecutor: T;
  private permissionPolicy: PermissionPolicy;
  private recoveryExecutor: RecoveryExecutor;
  private evidenceManager: EvidenceManager;
  private tracer: SessionTracer;
  private promptBuilder: DiagnosisPromptBuilder;
  private hookMap: DiagnosisHookMap;
  private initiator: InitiatorProfile | null = null;
  /** EC-02 Sprint A: ExpertSubsystem 依赖注入 (默认: ExpertSubAgentExecutor) */
  private expertExecutor: ExpertSubsystem | null = null;

  constructor(llmClient: C, toolExecutor: T) {
    this.config = { ...DEFAULT_CONFIG };
    this.llmClient = llmClient;
    this.toolExecutor = toolExecutor;
    this.permissionPolicy = createDefaultPermissionPolicy();
    this.recoveryExecutor = createDefaultRecoveryExecutor();
    this.evidenceManager = new EvidenceManager();
    this.tracer = new MemorySessionTracer();
    this.promptBuilder = new DiagnosisPromptBuilder();
    this.hookMap = new DiagnosisHookMap();
  }

  // ── Builder 方法（对标 Claw-Code #[must_use] with_*）──

  withMaxIterations(n: number): this {
    this.config.maxIterations = n;
    return this;
  }

  withGateDataCompleteness(threshold: number): this {
    this.config.gateDataCompleteness = threshold;
    return this;
  }

  withGateMinHypothesisConfidence(threshold: number): this {
    this.config.gateMinHypothesisConfidence = threshold;
    return this;
  }

  withPermissionPolicy(policy: PermissionPolicy): this {
    this.permissionPolicy = policy;
    return this;
  }

  withRecoveryExecutor(executor: RecoveryExecutor): this {
    this.recoveryExecutor = executor;
    return this;
  }

  withEvidenceManager(manager: EvidenceManager): this {
    this.evidenceManager = manager;
    return this;
  }

  withSessionTracer(tracer: SessionTracer): this {
    this.tracer = tracer;
    return this;
  }

  /** EC-02 Sprint A: 注入 ExpertSubsystem 实现 (默认: ExpertSubAgentExecutor) */
  withExpertExecutor(executor: ExpertSubsystem): this {
    this.expertExecutor = executor;
    return this;
  }

  withPromptBuilder(builder: DiagnosisPromptBuilder): this {
    this.promptBuilder = builder;
    return this;
  }

  withHookMap(hookMap: DiagnosisHookMap): this {
    this.hookMap = hookMap;
    return this;
  }

  // ── 主入口 ──

  /** 执行诊断咨询 */
  async runConsultation(
    teamId: string,
    initiator: InitiatorProfile,
  ): Promise<ConsultationResult> {
    this.initiator = initiator;
    // EC-02 Sprint B: 懒注册模块 (首次调用时初始化)
    ensureModulesRegistered();
    const startTime = Date.now();
    const degradedModules: string[] = [];
    let iteration = 0;

    // Phase 0: 界定范围
    if (!(await this.emitPhaseStarted(0, teamId))) {
      return this.buildFailedConsultation(teamId, {} as DiagnosisScope, [], DiagnosisErrorCode.GATE_CHECK_FAILED,
        'Phase 0 被 before_phase hook 中断', [], startTime);
    }
    const scope = await this.phase0Scope(teamId, initiator);
    this.emitPhaseCompleted(0, startTime);

    // Phase 1: 数据采集
    if (!(await this.emitPhaseStarted(1, teamId))) {
      return this.buildInterruptedResult(teamId, scope, [], degradedModules, startTime);
    }
    const { evidence, degraded } = await this.phase1Collect(teamId, scope);
    degradedModules.push(...degraded);
    this.emitPhaseCompleted(1, startTime, degraded);

    // ── A5: 安全检查（Phase 1 采集后运行，不阻断主流程）──
    try {
      const auditReport = runSecurityAudit({
        orgId: teamId, teamId,
        activeDataSources: ['system_logs', 'interviews', 'surveys'],
        authorizedScopes: scope.dimensions,
        aggregationThreshold: 3,
      });
      if (hasBlockingFindings(auditReport)) {
        degradedModules.push('security-blocking');
      }
      // 安全审计结果注入证据池
      for (const ev of auditReport.evidence) {
        this.evidenceManager.add(ev);
      }
    } catch (err) {
      log.warn({ err }, '[orchestrator] 安全检查失败');
      degradedModules.push('security-audit');
    }

    // ── B2: 会话持久化（Phase 1 证据写入 JSONL + SQLite）──
    try {
      const sessionId = (scope as any).sessionId || createSession(teamId, teamId).sessionId;
      (scope as any).sessionId = sessionId;
      for (const ev of evidence) {
        appendMessage(sessionId, teamId, { role: 'tool', content: ev.content, phase: 1, toolName: 'evidence' });
      }
    } catch (err) {
      log.warn({ err }, '[orchestrator] 会话持久化失败');
    }

    // ── B3: 上下文压缩（Claw-Code 机械模式，Phase 1 数据最重）──
    try {
      const sessionMessages = evidence.map(e => ({ role: 'tool' as const, content: e.content, phase: 1 }));
      if (shouldCompact(sessionMessages)) {
        const compaction = compactMessages(sessionMessages);
        if (compaction.removedMessageCount > 0) {
          degradedModules.push('context-compacted');
          compactSession(teamId, (scope as any).sessionId || 'unknown', compaction.summary);
        }
      }
    } catch (err) {
      log.warn({ err }, '[orchestrator] 上下文压缩失败（非阻断）');
    }

    // Gate Check: Phase 1 → 2
    if (!this.gateCheckPhase1to2(scope, evidence)) {
      const result = this.buildFailedConsultation(
        teamId, scope, evidence, DiagnosisErrorCode.GATE_CHECK_FAILED,
        'Phase 1 数据完整性不足，拒绝进入 Phase 2', degradedModules, startTime,
      );
      this.emitError(DiagnosisErrorCode.GATE_CHECK_FAILED, '数据完整性不足', false);
      return result;
    }

    // Phase 2: 假设生成（LLM）
    if (!(await this.emitPhaseStarted(2, teamId))) {
      return this.buildInterruptedResult(teamId, scope, evidence, degradedModules, startTime);
    }
    let hypotheses: DiagnosisHypothesis[] = [];
    let phase2Iterations = 0;

    while (phase2Iterations < this.config.maxIterations) {
      iteration++;
      phase2Iterations++;

      try {
        // EC-02 Sprint C: Phase 2 提取到独立文件
        hypotheses = await phase2Hypothesize(teamId, scope, {
          llmClient: this.llmClient as any,
          toolExecutor: this.toolExecutor as any,
          evidenceManager: this.evidenceManager as any,
          tracer: this.tracer as any,
          expertExecutor: this.expertExecutor,
          phase0State: (this as any).phase0State,
        });
        break;
      } catch (err) {
        const normalized = normalizeDiagnosisError(err);
        console.warn(`[diagnosis-orchestrator] Phase 2 LLM 假设生成失败 code=${normalized.code}: ${normalized.message}`);
        const recovery = await this.recoveryExecutor.attempt(
          DiagnosisFailureScenario.LLM_TIMEOUT,
        );
        if (recovery.outcome === 'failed') {
          // 降级为规则引擎假设
          hypotheses = this.generateRuleBasedHypotheses(evidence);
          break;
        }
      }
    }
    this.emitPhaseCompleted(2, startTime, degradedModules);

    // Gate Check: Phase 2 → 3
    if (!this.gateCheckPhase2to3(hypotheses)) {
      // 回退：用规则引擎补充假设
      const ruleHypotheses = this.generateRuleBasedHypotheses(evidence);
      hypotheses = [...hypotheses, ...ruleHypotheses];

      if (!this.gateCheckPhase2to3(hypotheses)) {
        const result = this.buildFailedConsultation(
          teamId, scope, evidence, DiagnosisErrorCode.EVIDENCE_INSUFFICIENT,
          '无法生成足够置信度的假设', degradedModules, startTime,
        );
        this.emitError(DiagnosisErrorCode.EVIDENCE_INSUFFICIENT, '假设置信度不足', false);
        return result;
      }
    }

    // Phase 3: 根因定位
    if (!(await this.emitPhaseStarted(3, teamId))) {
      return this.buildInterruptedResult(teamId, scope, evidence, degradedModules, startTime);
    }
    const rootCauseTree = await this.phase3RootCause(hypotheses, evidence);
    this.emitPhaseCompleted(3, startTime, degradedModules);

    // Phase 4: 报告生成
    if (!(await this.emitPhaseStarted(4, teamId))) {
      return this.buildInterruptedResult(teamId, scope, evidence, degradedModules, startTime);
    }
    const report = await this.phase4Report(teamId, scope, evidence, rootCauseTree, degradedModules, startTime);
    this.emitPhaseCompleted(4, startTime, degradedModules);

    // Phase 5: 交付同步（LLM）
    if (!(await this.emitPhaseStarted(5, teamId))) {
      return this.buildInterruptedResult(teamId, scope, evidence, degradedModules, startTime);
    }
    const delivery = await this.phase5Deliver(report, teamId);
    this.emitPhaseCompleted(5, startTime, degradedModules);

    const totalDurationMs = Date.now() - startTime;
    const result: ConsultationResult = {
      teamId,
      report,
      events: this.tracer.events(),
      totalDurationMs,
      degradedModules,
      delivery,
    };

    return result;
  }

  // ── 六阶段实现 ──

  /** Phase 0: 界定范围——结构化卡片问卷 + 战略姿态识别，无 LLM */
  private async phase0Scope(
    teamId: string,
    initiator: InitiatorProfile,
  ): Promise<DiagnosisScope> {
    const dimensions = initiator.concerns && initiator.concerns.length > 0
      ? initiator.concerns
      : [
          'decision_making', 'information_flow', 'knowledge_sharing',
          'trust_level', 'goal_alignment', 'role_clarity',
        ];

    // 战略姿态识别
    const detection = initiator.postureAnswers
      ? detectPosture(initiator.postureAnswers)
      : defaultDetection();

    this.tracer.trace({
      type: 'evidence_added',
      evidence: {
        id: `posture-${detection.posture}`,
        source: 'module',
        content: `战略姿态: ${detection.label} (置信度: ${(detection.confidence * 100).toFixed(0)}%, 依据: ${detection.reasons.join('; ')})`,
        confidence: detection.confidence,
        timestamp: new Date().toISOString(),
        phase: 0,
        dimension: 'strategic_posture',
        isPrivate: false,
        moduleId: 'posture-detector',
      },
      timestamp: new Date().toISOString(),
    });

    // 多角色访谈项目（P2-18 接线）
    let interviewProjectId: string | undefined;
    if (initiator.enableMultiRoleInterview) {
      try {
        const { project } = createInterviewProject({
          teamId,
          name: `${initiator.name ?? initiator.role} 发起的诊断访谈`,
          dimensions,
          depth: 'standard',
          maxInterviewees: 12,
        });
        interviewProjectId = project.id;
        this.tracer.trace({
          type: 'evidence_added',
          evidence: {
            id: `interview-project-${project.id}`,
            source: 'module',
            content: `多角色访谈项目已创建: ${project.name} (${project.id}), 通道: ${project.channels.map(c => c.type).join(', ')}, 最大受访者: ${project.scope.maxInterviewees}人`,
            confidence: 1.0,
            timestamp: new Date().toISOString(),
            phase: 0,
            dimension: 'interview_setup',
            isPrivate: false,
            moduleId: 'interview-project-manager',
          },
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        log.warn({ err, teamId }, '[orchestrator] 访谈项目创建失败，继续无访谈模式诊断');
      }
    }

    return {
      teamId,
      dimensions,
      interviewProjectId,
      excludedDimensions: {},
      depth: 'standard',
      confirmedAt: new Date().toISOString(),
      posture: detection.posture,
    };
  }

  /** Phase 1: 数据采集——并行运行诊断模块，经由 EvidenceManager 去重，无 LLM */
  private async phase1Collect(
    teamId: string,
    _scope: DiagnosisScope,
  ): Promise<{ evidence: DiagnosisEvidence[]; degraded: string[] }> {
    const degraded: string[] = [];

    try {
      const results = await runModules(teamId);
      for (const result of results) {
        if (result.status === 'degraded' || result.status === 'failed') {
          degraded.push(result.moduleId);
        }
        // 降级空结果：模块未抛错但显式返回了空信号 → 未采集到真实数据
        const isEmptySummary = !result.summary ||
          result.summary === '无数据' ||
          result.summary.startsWith('0 条记录');
        const effectiveConfidence = result.status === 'ok'
          ? (isEmptySummary ? 0.3 : 0.85)
          : result.status === 'degraded' ? 0.5 : 0.2;
        if (result.status === 'ok' && isEmptySummary) {
          degraded.push(result.moduleId);
        }
        const ev: DiagnosisEvidence = {
          id: `ev-${result.moduleId}-${Date.now()}`,
          source: 'module',
          content: result.summary ?? `模块 ${result.moduleId}: status=${result.status}`,
          confidence: effectiveConfidence,
          timestamp: new Date().toISOString(),
          phase: 1,
          dimension: this.inferDimension(result.moduleId),
          isPrivate: false,
          moduleId: result.moduleId,
        };
        // 经由 EvidenceManager 去重：同 source+dimension+moduleId 只保留最高置信度
        this.evidenceManager.add(ev);
        this.tracer.trace({
          type: 'evidence_added',
          evidence: ev,
          timestamp: ev.timestamp,
        });
      }
    } catch {
      const recovery = await this.recoveryExecutor.attempt(
        DiagnosisFailureScenario.MODULE_COMPUTE_FAILED,
      );
      if (recovery.outcome === 'degraded') {
        degraded.push('module-compute');
      }
    }

    // 多角色访谈进度（P2-18 接线）
    if (_scope.interviewProjectId) {
      try {
        const progress = getProjectProgress(_scope.interviewProjectId);
        if (progress) {
          const progressEv: DiagnosisEvidence = {
            id: `ev-interview-progress-${Date.now()}`,
            source: 'module',
            content: `访谈项目进度: ${progress.completedSessions}/${progress.totalInterviewees} 完成 (${progress.declinedSessions} 拒绝), 问卷回收率 ${(progress.surveyResponseRate * 100).toFixed(0)}%, 数据完整度 ${(progress.dataCompleteness * 100).toFixed(0)}%, 下一步: ${progress.nextRecommendedAction}`,
            confidence: 0.9,
            timestamp: new Date().toISOString(),
            phase: 1,
            dimension: 'interview_progress',
            isPrivate: false,
            moduleId: 'interview-project-manager',
          };
          this.evidenceManager.add(progressEv);
          this.tracer.trace({
            type: 'evidence_added',
            evidence: progressEv,
            timestamp: progressEv.timestamp,
          });
          if (progress.dataCompleteness < 0.5) {
            degraded.push('interview-coverage');
          }
        }
      } catch (err) {
        log.warn({ err, projectId: _scope.interviewProjectId }, '[orchestrator] 访谈进度查询失败');
        degraded.push('interview-progress');
      }
    }

    const evidence = this.evidenceManager.query();
    return { evidence, degraded };
  }

  /** Phase 2: 假设生成——调用 LLM，使用 EvidenceManager 过滤后的高置信度证据 */
  /** Phase 2: 6 专家并行分析 + 合成器交叉验证 */
  private async phase2Hypothesize(
    teamId: string,
    scope: DiagnosisScope,
    evidence: DiagnosisEvidence[],
  ): Promise<DiagnosisHypothesis[]> {
    this.evidenceManager.expireByAge(7 * 24 * 60 * 60 * 1000);
    const filteredEvidence = this.evidenceManager.query({ minConfidence: 0.4 });
    const diagnosisId = `diag_${Date.now().toString(36)}`;

    // ── 1. 准备: 构建 SessionBrief + 6 个 ExpertSubAgentContext ──
    const sessionBrief = extractSessionBrief(
      { ...(this as any).phase0State || {}, orgName: scope.teamId, teamSize: '' },
      { dimensions: scope.dimensions, depth: scope.depth },
    );
    sessionBrief.diagnosisId = diagnosisId;

    // EC-02 Sprint A: 依赖注入 — 优先使用注入的 executor, 否则默认 ExpertSubAgentExecutor
    const executor: ExpertSubsystem = this.expertExecutor
      || new ExpertSubAgentExecutor(this.llmClient, this.toolExecutor) as unknown as ExpertSubsystem;
    const expertTypes: ExpertType[] = ['strategic_analyst','org_diagnostician','financial_analyst','tech_architect','marketing_analyst','action_advisor'];

    const contexts: ExpertSubAgentContext[] = expertTypes.map(type => {
      const policy = getDataAccessPolicy(type);
      let ev = filterEvidenceForExpert(filteredEvidence, policy);
      if (policy.anonymizedView) ev = anonymizeEvidence(ev);
      return {
        expertType: type,
        diagnosisId,
        orgName: scope.teamId,
        teamId,
        sessionBrief,
        allowedEvidence: ev,
        allowedTools: getAllowedToolsForExpert(type),
        dataPolicy: policy,
        systemPrompt: buildExpertSystemPrompt(type, { teamId, phase: 2, evidence: ev, sessionBrief }),
        expertKnowledge: renderKnowledgeForSystemPrompt(type),
        outputSchema: EXPERT_REPORT_SCHEMA,
        timeoutMs: 120_000,
        maxRetries: 1,
      };
    });

    // ── 2. 并行执行 6 专家 ──
    const reports = await executor.executeAll(contexts as unknown as ExpertContext[]);
    for (const r of reports) {
      saveExpertReport(r as unknown as ExpertReport);
      this.tracer.trace({ type: 'expert_report_completed', expertType: r.expertType, status: r.status, timestamp: new Date().toISOString() } as any);
    }

    // ── 2b. B2: 专家本体桥接 — 应用 ontologyPatches 到本体图 ──
    try {
      const { applyOntologyPatches } = require('./expert-ontology-bridge');
      const { createGraphStore } = require('./graph-store');
      const store = createGraphStore('sqlite', require('../../../infra/engine-context').getEngineContext()?.database?.getDb?.());
      if (store) {
        applyOntologyPatches(reports, store, scope.teamId);
      }
    } catch (err) {
      log.warn({ err }, '[orchestrator] 本体桥接失败 (非阻断)');
    }

    // ── 3. 合成 ──
    let synthesis: Awaited<ReturnType<typeof synthesizeExpertReports>>;
    try {
      synthesis = await synthesizeExpertReports(reports as unknown as ExpertReport[], filteredEvidence, this.llmClient);
    } catch (err) {
      log.warn({ err }, '[orchestrator] 合成失败, 回退到规则引擎');
      return this.generateRuleBasedHypotheses(filteredEvidence);
    }

    // ── 4. 矛盾优先排序 ──
    const hypotheses = synthesis.hypotheses;
    const contradictions = this.evidenceManager.detectContradictions();
    for (const h of hypotheses) {
      const related = contradictions.filter(c => h.dimensions.includes(c.dimension));
      if (related.length > 0) {
        (h as any).contradictionSignal = {
          dimension: related[0].dimension,
          description: related[0].description || '证据方向冲突',
          strength: related[0].severity || 0.5,
        };
      }
    }
    hypotheses.sort((a, b) => {
      const aC = (a as any).contradictionSignal ? 1 : 0;
      const bC = (b as any).contradictionSignal ? 1 : 0;
      if (aC !== bC) return bC - aC;
      return b.confidence - a.confidence;
    });

    for (const h of hypotheses) {
      this.tracer.trace({ type: 'hypothesis_generated', hypothesis: h, timestamp: new Date().toISOString() });
    }
    return hypotheses;
  }

  /** Phase 3: 根因定位——规则引擎 + EvidenceManager 矛盾检测，无 LLM */
  private async phase3RootCause(
    hypotheses: DiagnosisHypothesis[],
    evidence: DiagnosisEvidence[],
  ): Promise<RootCauseTree> {
    const rootCauses: RootCause[] = [];
    // 使用 EvidenceManager 的矛盾检测（跨角色认知差异）
    const contradictions = this.evidenceManager.detectContradictions();

    for (const h of hypotheses.filter(h => h.status !== 'refuted')) {
      const chain = this.buildCausalChain(h, evidence);
      const dim = h.dimensions[0] ?? 'unknown';

      // ── 跨维度关联（信任建立：展示全景视角，不孤立的归因）──
      const crossDimensionLinks: RootCause['crossDimensionLinks'] = [];
      const otherDims = h.dimensions.slice(1); // 假设本身已有关联维度
      for (const otherDim of otherDims) {
        const relatedEvidence = evidence.filter(e => e.dimension === otherDim);
        if (relatedEvidence.length > 0) {
          crossDimensionLinks.push({
            dimension: otherDim,
            relationship: `${dim} → ${otherDim}: 此根因可能通过${otherDim}维度间接影响组织`,
            evidenceCount: relatedEvidence.length,
          });
        }
      }
      // 从证据池中查找其他维度的矛盾信号
      for (const c of contradictions) {
        if (c.dimension !== dim && !crossDimensionLinks.some(l => l.dimension === c.dimension)) {
          crossDimensionLinks.push({
            dimension: c.dimension,
            relationship: `矛盾信号: ${c.dimension} 维度存在认知冲突 (强度 ${(c.severity * 100).toFixed(0)}%)——此根因的归因需要考虑该维度的相反信号`,
            evidenceCount: 2,
          });
        }
      }

      const rootCause: RootCause = {
        id: `rc-${h.id}`,
        dimension: dim,
        confidence: h.confidence,
        supportingEvidence: h.supportingEvidence,
        causalChain: chain,
        crossDimensionLinks: crossDimensionLinks.length > 0 ? crossDimensionLinks : undefined,
        description: h.statement,
      };
      rootCauses.push(rootCause);

      this.tracer.trace({
        type: 'root_cause_identified',
        rootCause,
        timestamp: new Date().toISOString(),
      });
    }

    for (const c of contradictions) {
      this.tracer.trace({
        type: 'contradiction_detected',
        evidenceA: c.evidenceA,
        evidenceB: c.evidenceB,
        dimension: c.dimension,
        timestamp: new Date().toISOString(),
      });
    }

    // ── 矛盾优先排序：有矛盾的根因排在前面（信任建立：矛盾是最有价值的信号）──
    rootCauses.sort((a, b) => {
      const aHasContra = a.crossDimensionLinks?.some(l => l.relationship.includes('矛盾信号')) ? 1 : 0;
      const bHasContra = b.crossDimensionLinks?.some(l => l.relationship.includes('矛盾信号')) ? 1 : 0;
      if (aHasContra !== bHasContra) return bHasContra - aHasContra;
      return b.confidence - a.confidence;
    });

    return {
      rootCauses,
      contradictions,
      generatedAt: new Date().toISOString(),
    };
  }

  /** Phase 4: 报告生成——模板渲染，无 LLM */
  private async phase4Report(
    teamId: string,
    scope: DiagnosisScope,
    evidence: DiagnosisEvidence[],
    rootCauseTree: RootCauseTree,
    degradedModules: string[],
    startTime: number,
  ): Promise<StructuredDiagnosisReport> {
    const gapRadar: Record<string, number> = {};

    // 优先从 gap-recorder 取真实的缝隙分数（6 个核心维度）
    const snapshot = getLatestSnapshot(teamId);
    if (snapshot?.gaps) {
      for (const [dim, val] of Object.entries(snapshot.gaps)) {
        gapRadar[dim] = Math.round(val.engineScore * 100) / 100;
      }
    }

    // 补充非缝隙维度的证据分（如 cpc、hona 等扩展模块），归一化到 0-1
    const GAP_DIM_SET = new Set(GAP_DIMENSIONS);
    const dimGroups: Record<string, DiagnosisEvidence[]> = {};
    for (const e of evidence) {
      if (!GAP_DIM_SET.has(e.dimension as any)) {
        (dimGroups[e.dimension] ??= []).push(e);
      }
    }
    for (const [dim, evs] of Object.entries(dimGroups)) {
      const avgConfidence = evs.reduce((s, e) => s + e.confidence, 0) / evs.length;
      gapRadar[dim] = Math.round(avgConfidence * 100) / 100;
    }
    // 兜底：scope 中指定了但既无快照也无证据的维度
    for (const dim of scope.dimensions) {
      if (!(dim in gapRadar)) {
        gapRadar[dim] = 0;
      }
    }

    const keyFindings: ModuleFinding[] = rootCauseTree.rootCauses.map(rc => ({
      moduleId: rc.dimension,
      severity: rc.confidence < 0.5 ? 'low' : rc.confidence < 0.7 ? 'medium' : rc.confidence < 0.9 ? 'high' : 'critical',
      detail: rc.description,
      evidenceRefs: rc.supportingEvidence,
    }));

    const postureConfig = loadPostureConfig(scope.posture || 'steady_operator');
    const ceoSummary = this.generateCEOSummary(rootCauseTree, scope, postureConfig);

    // 用姿态透镜翻译关键发现
    const translatedFindings = keyFindings.map(f => {
      const score = gapRadar[f.moduleId];
      const translated = translateFinding(postureConfig.posture, f.moduleId, f, score);
      return {
        ...f,
        detail: translated.narrative,
        severity: translated.severity,
      };
    });

    // 用姿态透镜翻译行动建议
    const actions = this.generateDefaultActions(rootCauseTree).map((a, i) => {
      const f = keyFindings[i];
      if (f) return translateAction(postureConfig.posture, f.moduleId, f);
      return a;
    });

    return {
      ceoSummary,
      gapRadar,
      keyFindings: translatedFindings,
      evidenceChain: evidence,
      rootCauseTree,
      actionRecommendations: actions,
      generatedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      degradedModules,
      posture: postureConfig.posture,
      postureLabel: postureConfig.label,
    };
  }

  /** Phase 5: 交付同步——权限检查 + LLM 生成行动建议 */
  private async phase5Deliver(
    report: StructuredDiagnosisReport,
    _teamId: string,
  ): Promise<DeliveryResult> {
    const reportUrl = `/api/diagnosis/reports/${_teamId}/${new Date().toISOString().slice(0, 10)}.html`;

    // 权限检查：发起人是否有权推送诊断报告到外部系统
    let syncedToExternal = false;
    if (this.initiator) {
      const request: PermissionRequest = {
        resource: 'delivery',
        context: {
          requesterRole: this.initiator.role,
          requesterTeamId: _teamId,
          targetTeamId: _teamId,
          isInitiator: true,
          isFDE: false,
        },
        action: 'write',
      };
      const result = this.permissionPolicy.check(request);
      if (result.allowed) {
        try {
          const promptBuilder = new DiagnosisPromptBuilder().withPhase(5);
          const systemPrompt = promptBuilder.build();

          const response = await this.llmClient.consult(
            systemPrompt,
            `基于以下诊断报告，生成具体可执行的行动建议：\n${JSON.stringify(report.keyFindings)}`,
          );
          // 尝试将 LLM 建议合并到报告
          const llmActions = this.parseActionItems(response.content);
          if (llmActions.length > 0) {
            report.actionRecommendations = [...new Set([...report.actionRecommendations, ...llmActions])];
          }
          syncedToExternal = true;
        } catch {
          // Phase 5 LLM 失败不阻断——降级为默认建议
        }
      }
    }

    this.tracer.trace({
      type: 'report_ready',
      reportUrl,
      timestamp: new Date().toISOString(),
    });

    // ── 持续监测锚点（信任闭环：Phase 5 不是结束，是持续监测的开始）──
    const nextDate = new Date();
    nextDate.setMonth(nextDate.getMonth() + 1); // 默认建议每月一次
    const nextDateStr = nextDate.toISOString().slice(0, 10);

    const continuousMonitoringAnchor = {
      nextDiagnosisDate: nextDateStr,
      autoCheckItems: [
        '行动项完成情况——上个月的建议哪些做了、哪些没做',
        '相关指标变化趋势——关注的维度是改善、持平还是恶化',
        '是否有新的异常信号——指标突然偏离基线的预警',
      ],
      message: [
        `这不是一次性的诊断。下一次诊断建议在 ${nextDateStr}，引擎会自动检查：`,
        ...report.actionRecommendations.slice(0, 3).map((a, i) => `  ${i + 1}. ${a.slice(0, 60)}...`),
        '',
        '你也可以随时在感觉"不对劲"的时候，发起一次快速诊断。我不需要预约，随时在线。',
      ].join('\n'),
    };

    this.tracer.trace({
      type: 'report_ready',
      reportUrl,
      timestamp: new Date().toISOString(),
    });

    // 闭环反馈：记录诊断完成，供后续校准使用 (Phase 1: 闭环反馈)
    this.recordDiagnosisComplete(_teamId, report);

    return {
      reportUrl,
      syncedToExternal,
      continuousMonitoringAnchor,
    };
  }

  /** 闭环反馈：诊断完成后自动记录 (Phase 1) */
  private recordDiagnosisComplete(teamId: string, report: StructuredDiagnosisReport): void {
    try {
      const db = getEngineContext().database?.getDb?.();
      if (!db) return;
      const { FeedbackStore } = require('./feedback-persistence');
      const store = new FeedbackStore(db);
      store.submitFeedback({
        feedbackId: `fb_${Date.now().toString(36)}`,
        diagnosisId: `diag_${teamId}_${Date.now().toString(36)}`,
        overallRating: null, // 用户后续补充
        adoptionRate: null,  // 等待行动项执行结果
        mostValuableInsight: (report.keyFindings?.[0] as unknown as Record<string, unknown> | undefined)?.description as string || null,
        mostInaccurateInsight: null,
        improvementSuggestions: null,
      });
    } catch (err) {
      // 反馈记录失败不阻断诊断交付
      log.warn({ err }, '[orchestrator] 闭环反馈记录失败');
    }
  }

  private parseActionItems(llmOutput: string): string[] {
    try {
      const parsed = JSON.parse(llmOutput);
      if (Array.isArray(parsed)) {
        return parsed.map((a: unknown) => typeof a === 'string' ? a : String((a as Record<string, unknown>).action ?? (a as Record<string, unknown>).recommendation ?? ''));
      }
    } catch {
      // 非 JSON，逐行提取
      return llmOutput.split('\n').filter(l => l.trim().length > 10).slice(0, 5);
    }
    return [];
  }

  // ── Gate Check ──

  private gateCheckPhase1to2(scope: DiagnosisScope, evidence: DiagnosisEvidence[]): boolean {
    // 数据完整性：有效证据（confidence ≥ 0.4）占已注册模块的比例 ≥ 阈值。
    // 分母用模块总数而非 scope 维度——避免 scope 维度与证据维度命名体系不同
    // 导致的误判（如 scope=information_flow vs evidence=gaps）。
    const validEvidence = evidence.filter(e => e.confidence >= 0.4);
    const totalModules = listModules().length;
    const ratio = validEvidence.length / Math.max(totalModules, 1);
    if (ratio < this.config.gateDataCompleteness) {
      return false;
    }
    // 权限检查：发起人是否有权查看采集到的证据
    if (this.initiator) {
      const scopeCtx = scope as DiagnosisScope & { teamId?: string };
      const teamId = scopeCtx.teamId ?? '';
      const request: PermissionRequest = {
        resource: 'evidence:*',
        context: {
          requesterRole: this.initiator.role,
          requesterTeamId: teamId,
          targetTeamId: teamId,
          isInitiator: true,
          isFDE: false,
        },
        action: 'read',
      };
      const result = this.permissionPolicy.check(request);
      if (!result.allowed) return false;
    }
    return true;
  }

  private gateCheckPhase2to3(hypotheses: DiagnosisHypothesis[]): boolean {
    if (hypotheses.length === 0) return false;
    return hypotheses.some(h => h.confidence >= this.config.gateMinHypothesisConfidence);
  }

  // ── 规则引擎 fallback ──

  private generateRuleBasedHypotheses(evidence: DiagnosisEvidence[]): DiagnosisHypothesis[] {
    // 维度聚类——将语义相近的维度归入同一诊断命题
    const clusters: { label: string; dims: string[]; template(evidence: DiagnosisEvidence[]): string }[] = [
      {
        label: '信息与协作',
        dims: ['information_flow', 'knowledge_sharing', 'collaboration_protocol', 'information_processing'],
        template: (ev) => ev.length >= 2
          ? `信息流动、知识共享与协作协议共 ${ev.length} 项指标偏低，指向团队文档化不足或透明沟通机制缺失`
          : `协作信息通道存在薄弱环节（${ev.map(e => e.content.slice(0, 30)).join('、')}）`,
      },
      {
        label: '决策与权限',
        dims: ['authority_governance', 'decision_making', 'goal_alignment', 'external_interface'],
        template: (ev) => ev.length >= 2
          ? `决策治理与目标对齐共 ${ev.length} 项指标异常，反映出审批层级或目标传导链条存在断裂`
          : `决策权或目标对齐有优化空间（${ev.map(e => e.content.slice(0, 30)).join('、')}）`,
      },
      {
        label: '人才与信任',
        dims: ['trust_incentive', 'trust_health', 'division_of_labor', 'self-awareness'],
        template: (ev) => ev.length >= 2
          ? `信任机制、分工模式与自知偏差共 ${ev.length} 项信号，团队可能存在角色模糊或激励不对齐`
          : `人员信任或分工维度需关注（${ev.map(e => e.content.slice(0, 30)).join('、')}）`,
      },
      {
        label: '结构与网络',
        dims: ['network_structure', 'organizational_boundary', 'path_dependency', 'human_agent_collaboration'],
        template: (ev) => ev.length >= 2
          ? `组织网络结构与边界弹性共 ${ev.length} 项异常，可能存在孤岛化或过度依赖历史路径`
          : `组织拓扑或路径依赖需审视（${ev.map(e => e.content.slice(0, 30)).join('、')}）`,
      },
      {
        label: '能力与壁垒',
        dims: ['capability_coverage', 'competitive_moat', 'gaps', 'dynamics', 'attention', 'identity'],
        template: (ev) => ev.length >= 2
          ? `能力谱系与竞争壁垒共 ${ev.length} 项指标偏低，团队核心能力覆盖或差异化优势不足`
          : `能力或壁垒维度存在弱项（${ev.map(e => e.content.slice(0, 30)).join('、')}）`,
      },
      {
        label: '财务与效率',
        dims: ['financial_health', 'token_efficiency', 'benchmark', 'data-enricher'],
        template: (ev) => ev.length >= 2
          ? `财务健康度与资源效率共 ${ev.length} 项信号，投入产出比或成本结构值得关注`
          : `财务或效率指标有波动（${ev.map(e => e.content.slice(0, 30)).join('、')}）`,
      },
      {
        label: '自动化与工具',
        dims: ['auto-interpreter', 'auto-action', 'task-integration'],
        template: (ev) => ev.length >= 2
          ? `自动化诊断工具链共 ${ev.length} 项模块运行异常，可能影响诊断报告质量与行动落地`
          : `自动化模块部分降级（${ev.map(e => e.content.slice(0, 30)).join('、')}）`,
      },
    ];

    const results: DiagnosisHypothesis[] = [];
    let hypIdx = 0;
    const assignedDims = new Set<string>();

    for (const cluster of clusters) {
      const clusterEvidence = evidence.filter(e =>
        cluster.dims.includes(e.dimension) && !assignedDims.has(e.dimension),
      );
      if (clusterEvidence.length === 0) continue;

      const dims = [...new Set(clusterEvidence.map(e => e.dimension))];
      for (const d of dims) assignedDims.add(d);

      const avgConf = clusterEvidence.reduce((s, e) => s + e.confidence, 0) / clusterEvidence.length;

      results.push({
        id: `rule-hyp-${hypIdx++}`,
        statement: cluster.template(clusterEvidence),
        dimensions: dims,
        confidence: Math.min(avgConf, 0.72),
        supportingEvidence: clusterEvidence.map(e => e.id),
        refutingEvidence: [],
        status: 'active' as const,
        generatedInPhase: 2,
      });
    }

    // 未被任何聚类覆盖的维度——单独处理，但不逐条泛化
    const orphans = evidence.filter(e => !assignedDims.has(e.dimension));
    if (orphans.length > 0) {
      const orphanDims = [...new Set(orphans.map(e => e.dimension))];
      const orphanConf = orphans.reduce((s, e) => s + e.confidence, 0) / orphans.length;
      results.push({
        id: `rule-hyp-${hypIdx++}`,
        statement: `共 ${orphanDims.length} 个未归类维度（${orphanDims.join('、')}）信号偏低，建议人工复核`,
        dimensions: orphanDims,
        confidence: Math.min(orphanConf, 0.55),
        supportingEvidence: orphans.map(e => e.id),
        refutingEvidence: [],
        status: 'active' as const,
        generatedInPhase: 2,
      });
    }

    return results;
  }

  // ── 辅助方法 ──

  private buildCausalChain(hypothesis: DiagnosisHypothesis, evidence: DiagnosisEvidence[]): CausalChain {
    const refs = evidence.filter(e => hypothesis.supportingEvidence.includes(e.id));
    const nodes = refs.map((e, i) => ({
      id: `node-${i}`,
      label: e.content.slice(0, 80),
      type: i === 0 ? 'root_cause' as const : 'symptom' as const,
      dimension: e.dimension,
      severity: 1 - e.confidence,
    }));

    const edges = nodes.slice(1).map((node, i) => ({
      from: nodes[i].id,
      to: node.id,
      label: '导致',
      strength: 0.5,
    }));

    // Ensure at least one node
    if (nodes.length === 0) {
      nodes.push({
        id: 'node-0',
        label: hypothesis.statement.slice(0, 80),
        type: 'root_cause',
        dimension: hypothesis.dimensions[0] ?? 'unknown',
        severity: 1 - hypothesis.confidence,
      });
    }

    return { nodes, edges };
  }

  private summarizeEvidence(evidence: DiagnosisEvidence[]): string {
    return evidence
      .map(e => `[${e.id}] ${e.dimension}: ${e.content.slice(0, 200)} (confidence=${e.confidence})`)
      .join('\n');
  }

  private generateCEOSummary(tree: RootCauseTree, scope: DiagnosisScope, postureCfg?: { posture: StrategicPosture; label: string }): string {
    const count = tree.rootCauses.length;
    const dims = [...new Set(tree.rootCauses.map(rc => rc.dimension))];
    const avgConf = count > 0
      ? tree.rootCauses.reduce((s, rc) => s + rc.confidence, 0) / count
      : 0;

    const base = `本次诊断覆盖 ${scope.dimensions.length} 个维度，发现 ${count} 个根因（平均置信度 ${avgConf.toFixed(2)}），涉及 ${dims.length} 个维度。${tree.contradictions.length > 0 ? `检测到 ${tree.contradictions.length} 个矛盾信号需重点关注。` : ''}`;

    if (postureCfg) {
      const opening = postureOpening(postureCfg.posture);
      return `${postureCfg.label} · ${opening}\n\n${base}`;
    }

    return base;
  }

  private generateDefaultActions(tree: RootCauseTree): string[] {
    const dimensionActions: Record<string, string> = {
      information_flow: '建立信息流转日报机制，每周识别一次信息堵点并指定责任人在 48h 内疏通',
      knowledge_sharing: '设立可搜索的知识库，要求关键决策后 24h 内沉淀为文档，纳入新人入职必读',
      authority_governance: '绘制 RACI 决策矩阵，明确每类决策的审批链，消除"谁都管/谁都不管"地带',
      division_of_labor: '更新角色职责卡，标注"负责/咨询/知情"三栏，团队周会上 5 分钟对齐一次',
      trust_incentive: '在低风险项目中引入自主决策实验，4 周后回测信任维度变化',
      external_interface: '制定对外交付 SOP 检查清单，发送前由第二人复核',
      collaboration_protocol: '补齐核心协作协议，从分工和信息流两个维度优先建立明确规则',
      human_agent_collaboration: '审查 HITL 修正事件，建立高频修正模式的自动化规则',
      network_structure: '为孤立节点建立定期同步路由，考虑增加 bridge 角色连接碎片子网',
      capability_coverage: '优先填补覆盖度为零的能力维度，考虑外包或招聘以补足短板',
      competitive_moat: '审视竞争护城河维度，建立差异化优势的定期评估机制',
      financial_health: '优先修复成本最高的前 3 个低效来源，预计 2 个月内看到财务改善',
      goal_alignment: '组织季度 OKR 对齐会议，确保人、Agent、组织三方目标一致',
      trust_health: '审查单点依赖风险，为关键 Agent 建立冗余路由或知识备份',
      identity: '组织团队价值观工作坊，共同定义"我们如何工作"，结果写入 SOUL.md',
    };

    return tree.rootCauses.slice(0, 5).map(rc => {
      const action = dimensionActions[rc.dimension]
        ?? `建立专项改进计划，指定责任人和 30 天检查点`;
      return `[${rc.dimension}] ${rc.description}: ${action}`;
    });
  }

  private parseHypotheses(
    llmOutput: string,
    evidence: DiagnosisEvidence[],
  ): DiagnosisHypothesis[] {
    const fromArray = (arr: unknown[]): DiagnosisHypothesis[] =>
      arr.slice(0, 5).map((h: unknown, i: number) => {
        const obj = h as Record<string, unknown>;
        return {
          id: `hyp-${i}`,
          statement: String(obj.statement ?? obj.hypothesis ?? ''),
          dimensions: Array.isArray(obj.dimensions) ? obj.dimensions as string[] : [String(obj.dimension ?? 'unknown')],
          confidence: Math.min(1, Math.max(0, Number(obj.confidence) || 0.5)),
          supportingEvidence: Array.isArray(obj.supportingEvidence) ? obj.supportingEvidence as string[] : [],
          refutingEvidence: Array.isArray(obj.refutingEvidence) ? obj.refutingEvidence as string[] : [],
          status: 'active' as const,
          generatedInPhase: 2,
        };
      });

    // 尝试 1: 裸 JSON 数组
    try {
      const parsed = JSON.parse(llmOutput);
      if (Array.isArray(parsed)) return fromArray(parsed);
      // 尝试 2: { hypotheses: [...] } 或 { findings: [...] } 包装
      if (typeof parsed === 'object' && parsed !== null) {
        const inner = (parsed as Record<string, unknown>).hypotheses
          ?? (parsed as Record<string, unknown>).findings
          ?? (parsed as Record<string, unknown>).items;
        if (Array.isArray(inner)) return fromArray(inner);
      }
    } catch { /* 非 JSON，继续尝试提取 */ }

    // 尝试 3: markdown 代码块包裹 ```json [...] ```
    const mdMatch = llmOutput.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (mdMatch) {
      try {
        const inner = JSON.parse(mdMatch[1].trim());
        if (Array.isArray(inner)) return fromArray(inner);
        if (typeof inner === 'object' && inner !== null) {
          const arr = (inner as Record<string, unknown>).hypotheses
            ?? (inner as Record<string, unknown>).findings
            ?? (inner as Record<string, unknown>).items;
          if (Array.isArray(arr)) return fromArray(arr);
        }
      } catch { /* 代码块内容非 JSON */ }
    }

    return this.generateRuleBasedHypotheses(evidence);
  }

  private inferDimension(moduleId: string): string {
    const dimensionMap: Record<string, string> = {
      'knowledge-flow': 'knowledge_sharing',
      'decision-latency': 'decision_making',
      'info-flow': 'information_flow',
      'trust-analyzer': 'trust_level',
      'goal-tracker': 'goal_alignment',
      'role-analyzer': 'role_clarity',
      hacd: 'human_agent_collaboration',
      cpc: 'collaboration_protocol',
      ipu: 'information_processing',
      hona: 'network_structure',
      'capability-spectrum': 'capability_coverage',
      'intent-alignment': 'goal_alignment',
      'seven-powers': 'competitive_moat',
      htm: 'trust_health',
      eob: 'organizational_boundary',
      'financial-impact': 'financial_health',
      'token-economics': 'token_efficiency',
    };
    return dimensionMap[moduleId] ?? moduleId;
  }

  // ── 事件发射 ──

  private async emitPhaseStarted(phase: number, teamId: string): Promise<boolean> {
    // 运行 before_phase hooks
    if (this.hookMap.has('before_phase')) {
      const ctx: BeforePhaseContext = { phase, teamId };
      const result = await this.hookMap.run('before_phase', ctx);
      if (result === null) {
        this.tracer.trace({
          type: 'phase_started',
          phase,
          timestamp: new Date().toISOString(),
        });
        return false; // hook 中断
      }
    }

    this.tracer.trace({
      type: 'phase_started',
      phase,
      timestamp: new Date().toISOString(),
    });
    return true;
  }

  private emitPhaseCompleted(phase: number, startTime: number, degraded: string[] = []): void {
    this.tracer.trace({
      type: 'phase_completed',
      phase,
      durationMs: Date.now() - startTime,
      degradedModules: degraded,
      timestamp: new Date().toISOString(),
    });
  }

  private emitError(code: DiagnosisErrorCode, message: string, recoverable: boolean): void {
    this.tracer.trace({
      type: 'error',
      code,
      message,
      recoverable,
      timestamp: new Date().toISOString(),
    });
  }

  private buildInterruptedResult(
    teamId: string,
    scope: DiagnosisScope,
    evidence: DiagnosisEvidence[],
    degradedModules: string[],
    startTime: number,
  ): ConsultationResult {
    return this.buildFailedConsultation(
      teamId, scope, evidence,
      DiagnosisErrorCode.GATE_CHECK_FAILED,
      '诊断被 before_phase hook 中断',
      degradedModules, startTime,
    );
  }

  private buildFailedConsultation(
    teamId: string,
    scope: DiagnosisScope,
    evidence: DiagnosisEvidence[],
    errorCode: DiagnosisErrorCode,
    message: string,
    degradedModules: string[],
    startTime: number,
  ): ConsultationResult {
    const report: StructuredDiagnosisReport = {
      ceoSummary: `诊断未能完成：${message}`,
      gapRadar: {},
      keyFindings: [],
      evidenceChain: evidence,
      rootCauseTree: { rootCauses: [], contradictions: [], generatedAt: new Date().toISOString() },
      actionRecommendations: [],
      generatedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      degradedModules,
      posture: 'steady_operator',
      postureLabel: '稳健经营型',
    };

    return {
      teamId,
      report,
      events: this.tracer.events(),
      totalDurationMs: Date.now() - startTime,
      degradedModules,
      delivery: { reportUrl: '', syncedToExternal: false },
    };
  }

  // ── Tool Execution ──

  /**
   * 执行 LLM 请求的工具调用，经由 before_tool_call 钩子进行权限检查。
   *
   * @returns 工具执行结果，或 null（钩子中断）
   */
  async tryExecuteTool(
    toolName: string,
    input: Record<string, unknown>,
    teamId: string,
    phase: number,
  ): Promise<ToolResult | null> {
    const ctx: BeforeToolCallContext = {
      toolName,
      toolInput: input,
      teamId,
      phase,
      permission: 'execute',
    };

    const hookResult = await this.hookMap.run('before_tool_call', ctx);
    if (hookResult === null) {
      this.tracer.trace({
        type: 'error',
        code: DiagnosisErrorCode.PERMISSION_DENIED,
        message: `工具 ${toolName} 被 before_tool_call hook 拒绝`,
        recoverable: true,
        timestamp: new Date().toISOString(),
      });
      return null;
    }

    return this.toolExecutor.execute(toolName, JSON.stringify(hookResult.toolInput));
  }
}
