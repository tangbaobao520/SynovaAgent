/**
 * agent/conversation-engine.ts — 纯逻辑对话引擎 (Slice 1.1)
 *
 * 从 AgentConversation 中提取的核心对话逻辑，零 UI 依赖。
 * 不 import neo-blessed、readline、或任何 UI 框架。
 * TUI/Web/CLI 均为视图适配器，只负责接收输入和渲染输出。
 *
 * 状态机: Phase 0 (访谈) → Phase 1-5 (诊断流水线)
 *
 * Iron law #32: 错误统一通过 try/catch + log 处理，不静默吞。
 * Iron law #31: degraded 信号通过 ProcessResult 传播。
 */
import type { LLMProvider, LLMMessage } from '../providers/types';
import { ToolRegistry } from './tools';
import { createLogger } from '../logger';
import type { ViewAdapter } from '../l1-interaction/types';
import type { IntentRouter } from '../orchestrator/intent-router';
import type { DimensionRegistry } from '../orchestrator/dimension-registry';
import type { HookRunner } from '../orchestrator/hook-runner';
import type { SessionManager } from '../orchestrator/session-manager';
import type { EventBus } from '../orchestrator/event-bus';
import type { EvidenceCollector, CorroborationEngine } from '../evidence/index';
import type { createGraphBridge, GraphStore } from '../l4/graph-bridge';
import { ReportGraphAdapter } from '../l4/report-graph-adapter';
import type { DecisionInput, DecisionResult } from '../l4/decision-capture';
import {
  findDiagnosticPaths, summarizeSubgraph, findCrossDimensionalBrokers,
  getGraphDiff, detectAnomalousPatterns,
} from '../l4/diagnosis-graph-query';
import type { DiagnosticPath, SubgraphSummary, BrokerNode, GraphDiff, AnomalyPattern } from '../l4/diagnosis-graph-query';
import { reflectOnTriples } from '../l4/triple-reflection';
import type { Triple, ReflectionResult } from '../l4/triple-reflection';
import type { L3ResolutionResult } from '../l4/entity-resolver';
import type { CommunityReport } from '../l4/community-reports';
// P1-01: 子组件提取 — 单体引擎拆分为 3 个独立类
import { ToolLoopExecutor } from './tool-loop-executor';
import { DiagnosisLauncher, type DiagnosisEvent, type ConsultationResult } from './diagnosis-launcher';
import { OntologySyncer, type OntologySyncResult } from './ontology-syncer';
import type { EngineContext } from './engine-context';

const log = createLogger('agent/conversation-engine');

// ═══ Types ═══

// Re-export for backward compatibility (P1-01: 子组件提取)
export type { DiagnosisEvent, ConsultationResult, OntologySyncResult };

export interface EngineConfig {
  /** Phase 0 最大轮次 (默认 6) */
  maxTurns?: number;
  /** 组织 ID */
  orgId?: string;
  /** 编排层: IntentRouter (替换简单轮次计数) */
  intentRouter?: IntentRouter;
  /** 编排层: DimensionRegistry (维度覆盖追踪) */
  dimensionRegistry?: DimensionRegistry;
  /** 编排层: HookRunner (工具 pre/post hooks) */
  hookRunner?: HookRunner;
  /** 编排层: SessionManager (自动压缩) */
  sessionManager?: SessionManager;
  /** 编排层: EventBus (事件追踪) */
  eventBus?: EventBus;
  /** 会话 ID (用于事件追踪) */
  sessionId?: string;
  /** L3: EvidenceCollector (Phase 0 证据采集) */
  evidenceCollector?: EvidenceCollector;
  /** L4: GraphBridge (Phase 1 自动写入本体图) */
  graphBridge?: ReturnType<typeof createGraphBridge>;
  /** L4: ReportGraphAdapter (Phase 4 报告从图读取) */
  reportAdapter?: ReportGraphAdapter;
  /** L3: CorroborationEngine (Phase 3 矛盾检测+交叉验证) */
  corroborationEngine?: CorroborationEngine;
  /** L3: DecisionCapture callback (Phase 5 用户确认/驳回根因) */
  onDecision?: (decision: DecisionInput) => Promise<DecisionResult>;
  /** L4: GraphStore (for diagnosis graph queries + entity resolution) */
  graphStore?: GraphStore;
  /** L4: enable automated entity resolution after diagnosis (Phase 3a) */
  enableEntityResolution?: boolean;
  /** L4: enable community reports after GraphBridge sync (Phase 2b) */
  enableCommunityReports?: boolean;
  /** L4: enable triple reflection after diagnosis (Phase 3b) */
  enableTripleReflection?: boolean;
  /** 铁律 39: L2 通过 DiagnosisEngine 接口调用引擎 */
  diagnosisEngine?: import('../l2-interfaces/diagnosis-engine').DiagnosisEngine;
}

export interface ProcessResult {
  /** Agent 回复文本 */
  reply: string;
  /** Phase 0 是否完成，可以推进到 Phase 1 */
  phaseComplete: boolean;
}

export interface EngineState {
  orgId: string;
  phase: number;
  messages: LLMMessage[];
  startedAt: string;
}

/** @deprecated 使用 EngineState。保留用于 TUI/CLI 后向兼容。 */
export type ConversationState = EngineState;

const SYSTEM_PROMPT = `你是 SynovaAgent，一个组织数字孪生诊断专家。

你的角色是"组织医生"——通过结构化访谈了解用户组织的情况，然后运行六阶段诊断分析。

当前阶段：Phase 0（组织访谈）
你要做的是：
1. 了解组织名称、规模、行业
2. 了解当前最关心的问题/痛点
3. 了解组织架构（团队数量、关键角色）
4. 确认诊断深度和范围

规则：
- 每次只问 1-2 个问题，不要一次问太多
- 引用用户上一轮的回复，表现出你在认真倾听
- 收集到足够信息后，告知用户"访谈完成，开始运行诊断分析"
- 用中文回复，专业但不冷漠
- 回复控制在 100-200 字`;

// ═══ ConversationEngine ═══

export class ConversationEngine {
  private provider: LLMProvider;
  private messages: LLMMessage[];
  private phase: number;
  private orgId: string;
  private turnCount: number;
  private config: Required<EngineConfig>;
  private toolRegistry: ToolRegistry;
  private viewAdapter: ViewAdapter | null = null;

  // 编排层组件 (Iter 3-5 接线)
  private intentRouter: IntentRouter | null = null;
  private dimensionRegistry: DimensionRegistry | null = null;
  private hookRunner: HookRunner | null = null;
  private sessionManager: SessionManager | null = null;
  private eventBus: EventBus | null = null;
  private evidenceCollector: EvidenceCollector | null = null;
  private graphBridge: ReturnType<typeof createGraphBridge> | null = null;
  private reportAdapter: ReportGraphAdapter | null = null;
  private corroborationEngine: CorroborationEngine | null = null;
  private onDecision: ((decision: DecisionInput) => Promise<DecisionResult>) | null = null;
  private sessionId: string = '';
  // L4 本体层组件
  private graphStore: GraphStore | null = null;
  private enableEntityResolution: boolean = false;
  private enableCommunityReports: boolean = false;
  private enableTripleReflection: boolean = false;
  /** 维度覆盖追踪 (Phase 0) */
  private dimensionCoverage: Map<string, { status: string; confidence: number; evidenceCount: number }> = new Map();

  // P1-01: 子组件提取
  private toolLoop: ToolLoopExecutor;
  private diagnosisLauncher: DiagnosisLauncher;
  private ontologySyncer: OntologySyncer;

  constructor(provider: LLMProvider, config: EngineConfig = {}) {
    this.provider = provider;
    this.phase = 0;
    this.orgId = config.orgId || '';
    this.turnCount = 0;
    this.config = {
      maxTurns: config.maxTurns ?? 6,
      orgId: config.orgId || '',
    };
    this.messages = [{ role: 'system', content: SYSTEM_PROMPT }];
    this.toolRegistry = new ToolRegistry();

    // 编排层接线: 接收可选组件
    this.intentRouter = config.intentRouter || null;
    this.dimensionRegistry = config.dimensionRegistry || null;
    this.hookRunner = config.hookRunner || null;
    this.sessionManager = config.sessionManager || null;
    this.eventBus = config.eventBus || null;
    this.evidenceCollector = config.evidenceCollector || null;
    this.graphBridge = config.graphBridge || null;
    this.reportAdapter = config.reportAdapter || null;
    this.corroborationEngine = config.corroborationEngine || null;
    this.onDecision = config.onDecision || null;
    this.sessionId = config.sessionId || '';
    // L4 本体层接线
    this.graphStore = config.graphStore || null;
    this.enableEntityResolution = config.enableEntityResolution ?? false;
    this.enableCommunityReports = config.enableCommunityReports ?? false;
    this.enableTripleReflection = config.enableTripleReflection ?? false;

    // P1-01: 构建共享上下文 + 实例化子组件
    const diagnosisEngine = config.diagnosisEngine || createNoopEngine();
    const engineCtx: EngineContext = {
      provider: this.provider,
      messages: this.messages,
      orgId: this.orgId,
      sessionId: this.sessionId,
      toolRegistry: this.toolRegistry,
      hookRunner: this.hookRunner,
      eventBus: this.eventBus,
      evidenceCollector: this.evidenceCollector,
      graphBridge: this.graphBridge,
      graphStore: this.graphStore,
      diagnosisEngine,
      flags: {
        enableCommunityReports: this.enableCommunityReports,
        enableEntityResolution: this.enableEntityResolution,
      },
      loggerPrefix: 'agent',
    };
    this.toolLoop = new ToolLoopExecutor(engineCtx);
    this.diagnosisLauncher = new DiagnosisLauncher(engineCtx, diagnosisEngine);
    this.ontologySyncer = new OntologySyncer(engineCtx);
  }

  /** Bind a ViewAdapter for L1 decoupling (Slice C). When set, Engine uses adapter for display. */
  setViewAdapter(adapter: ViewAdapter): void {
    this.viewAdapter = adapter;
  }

  /** Phase 5: Record user decision on a root cause node */
  async recordDecision(decision: DecisionInput): Promise<DecisionResult> {
    if (this.onDecision) return this.onDecision(decision);
    return { recorded: false, error: 'DecisionCapture callback not configured' };
  }

  // ═══ L4 Ontology Public API ═══

  /** Phase 2a: Find diagnostic paths between node types (for ExpertAutonomyEngine) */
  findDiagnosticPaths(fromType: string, toType: string): DiagnosticPath[] {
    if (!this.graphStore) return [];
    return findDiagnosticPaths(this.graphStore, this.orgId, fromType, toType);
  }

  /** Phase 2a: Summarize subgraph around a root node (for ExpertAutonomyEngine) */
  summarizeSubgraph(rootId: string, maxDepth = 3): SubgraphSummary {
    if (!this.graphStore) return { rootId, nodeCount: 0, edgeCount: 0, typeDistribution: {}, strongestConnections: [], risks: [], anomalyScore: 0 };
    return summarizeSubgraph(this.graphStore, this.orgId, rootId, maxDepth);
  }

  /** Phase 2a: Find cross-dimensional brokers via betweenness centrality */
  findCrossDimensionalBrokers(): BrokerNode[] {
    if (!this.graphStore) return [];
    return findCrossDimensionalBrokers(this.graphStore, this.orgId);
  }

  /** Phase 2a: Detect anomalous graph patterns (isolated nodes, weight outliers) */
  detectAnomalousPatterns(): AnomalyPattern[] {
    if (!this.graphStore) return [];
    return detectAnomalousPatterns(this.graphStore, this.orgId);
  }

  /** Phase 2a: Get graph diff between time snapshots */
  getGraphDiff(fromDate?: string, toDate?: string): GraphDiff {
    if (!this.graphStore) return { nodesAdded: [], nodesRemoved: [], edgesAdded: [], edgesRemoved: [], weightChanges: [] };
    return getGraphDiff(this.graphStore, this.orgId, fromDate, toDate);
  }

  /** Phase 2b: Generate community reports from graph structure */
  generateCommunityReports(): CommunityReport[] {
    if (!this.graphStore || !this.enableCommunityReports) return [];
    try {
      return generateCommunityReports(this.graphStore, this.orgId);
    } catch (err: any) {
      log.warn({ err }, 'CommunityReports generation failed');
      return [];
    }
  }

  /** Phase 3a: Run L3 entity resolution to find duplicate entities */
  resolveEntities(): L3ResolutionResult {
    if (!this.graphStore || !this.enableEntityResolution) {
      return { matches: [], autoMerged: 0, queuedForReview: 0, ignored: 0 };
    }
    try {
      return resolveEntitiesL3(this.graphStore, this.orgId);
    } catch (err: any) {
      log.warn({ err }, 'EntityResolution failed');
      return { matches: [], autoMerged: 0, queuedForReview: 0, ignored: 0 };
    }
  }

  /** Phase 3b: Run triple reflection to validate knowledge graph triples */
  async reflectOnTriples(triples: Triple[]): Promise<ReflectionResult> {
    if (!this.enableTripleReflection || triples.length === 0) {
      return { reflections: [], degraded: false };
    }
    try {
      return await reflectOnTriples(
        { consult: (sys, ctx, opts) => this.provider.chat([{ role: 'system', content: sys }, { role: 'user', content: ctx }], opts) },
        triples,
      );
    } catch (err: any) {
      log.warn({ err }, 'TripleReflection failed');
      return { reflections: triples.map(t => ({ triple: t, action: 'keep' as const, reason: 'Reflection unavailable' })), degraded: true };
    }
  }

  // ═══ Public API ═══

  /** Get current phase (0-5) */
  getPhase(): number {
    return this.phase;
  }

  /** Get organization ID */
  getOrgId(): string {
    return this.orgId;
  }

  /** Set organization ID */
  setOrgId(id: string): void {
    this.orgId = id;
  }

  /** Advance to next phase */
  advancePhase(): void {
    this.phase++;
    log.debug({ phase: this.phase }, 'Phase 推进');
  }

  /** Get message history (shallow copy) */
  getMessages(): LLMMessage[] {
    return [...this.messages];
  }

  /** Get tool registry for registration/inspection */
  getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }

  // ═══ SOG Ontology Sync (delegated to OntologySyncer) ═══

  async syncToSOG(): Promise<OntologySyncResult> {
    return this.ontologySyncer.syncToSOG();
  }

  /** Get current ontology summary (for TUI side panel) */
  getOntologySummary(): OntologySyncResult {
    // Return cached last-sync result
    return this._lastOntologyResult || { persons: 0, teams: 0, teamCount: 0, created: false };
  }

  private _lastOntologyResult: OntologySyncResult | null = null;

  /**
   * Process a user message synchronously (non-streaming).
   *
   * Phase 0: structured interview with turn limit.
   * Phase 1-5: tool-call loop.
   *
   * @returns ProcessResult with reply text and phase completion signal
   */
  async processMessage(userInput: string): Promise<ProcessResult> {
    this.turnCount++;
    this.messages.push({ role: 'user', content: userInput });

    // L3 接线: EvidenceCollector — Phase 0 证据自动采集
    if (this.phase === 0 && this.evidenceCollector) {
      this.evidenceCollector.collectFromInterview(
        this.orgId || 'default', this.sessionId, [userInput],
      );
    }

    // Phase 0: 顾问式访谈 (Iter 3 接线 — 意图路由 + 维度覆盖)
    if (this.phase === 0) {
      // 意图分类 (9分支) — LLM驱动的顾问式对话
      if (this.intentRouter) {
        try {
          const intent = await this.intentRouter.classify(
            userInput,
            this.messages.filter(m => m.role === 'user').map(m => m.content),
          );
          if (intent.category === 'diagnostic' && intent.signals && this.dimensionRegistry) {
            const dims = this.dimensionRegistry.selectBySignals(intent.signals);
            for (const d of dims) {
              const existing = this.dimensionCoverage.get(d.id);
              if (!existing || existing.status === 'uncovered') {
                this.dimensionCoverage.set(d.id, { status: 'partial', confidence: 0.5, evidenceCount: 1 });
              } else {
                existing.evidenceCount++;
                if (existing.evidenceCount >= 2) {
                  existing.status = 'covered';
                  existing.confidence = Math.min(1, existing.confidence + 0.25);
                }
              }
            }
            this.sessionManager?.addMessage({ role: 'user', content: userInput });
          }
        } catch (err: any) { log.warn({ err: err.message }, '意图分类失败，降级为原有轮次逻辑'); }
      }

      const coveredCount = [...this.dimensionCoverage.values()].filter(d => d.status === 'covered').length;
      const explicitComplete = this.detectPhaseComplete(userInput);
      const turnLimitReached = this.turnCount >= this.config.maxTurns;
      const dimensionsReady = coveredCount >= 4;
      const minTurns = Math.min(3, this.config.maxTurns);

      // 用户想结束但维度不够 → 告知缺失，不结束
      if (explicitComplete && !dimensionsReady && this.turnCount >= minTurns) {
        const missing = [...this.dimensionCoverage.entries()]
          .filter(([, v]) => v.status !== 'covered').slice(0, 3)
          .map(([k]) => this.dimensionRegistry?.get(k)?.name || k).join('、');
        const reply = `感谢分享！诊断之前还想了解${missing || '一些补充信息'}——这对更准确的诊断结果很重要。`;
        this.messages.push({ role: 'assistant', content: reply });
        return { reply, phaseComplete: false };
      }

      if ((explicitComplete || turnLimitReached) && dimensionsReady && this.turnCount >= minTurns) {
        this.eventBus?.emit({
          id: `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`,
          type: 'phase.completed', consultationId: this.sessionId, phase: 0,
          data: { coveredDimensions: coveredCount, totalRounds: this.turnCount },
          traceId: this.sessionId, spanId: this.sessionId.slice(0, 16),
          timestamp: new Date().toISOString(),
        });

        const reply = '感谢你提供的信息！我已收集到足够的组织概况。现在开始运行六阶段诊断分析...';
        this.messages.push({ role: 'assistant', content: reply });
        this.phase = 1;

        // Slice 5.1: 自动同步 SOG 本体
        this.syncToSOG().then(r => { this._lastOntologyResult = r; }).catch(() => {});

        return { reply, phaseComplete: true };
      }

      const reply = await this.callLLMWithTools();
      this.messages.push({ role: 'assistant', content: reply });
      return { reply, phaseComplete: false };
    }

    // Phase 1-5: 工具调用循环
    const reply = await this.callLLMWithTools();
    this.messages.push({ role: 'assistant', content: reply });
    return { reply, phaseComplete: false };
  }

  /**
   * Process a user message with streaming token output.
   *
   * Each token is pushed to onToken() as it arrives.
   * Tool calls are executed inline — tool names are streamed as annotations.
   *
   * @param userInput - Raw user input text
   * @param onToken   - Callback invoked for each text/tool token
   * @returns ProcessResult with full reply and phase completion signal
   */
  async processMessageStream(
    userInput: string,
    onToken: (token: string) => void,
  ): Promise<ProcessResult> {
    this.turnCount++;
    this.messages.push({ role: 'user', content: userInput });

    // L1 decoupling: when ViewAdapter is bound, use it for display
    const display = (token: string) => {
      onToken(token);
      this.viewAdapter?.appendToken(token);
    };

    if (this.phase === 0) {
      const phaseComplete =
        this.turnCount >= this.config.maxTurns ||
        this.detectPhaseComplete(userInput);
      const minTurns = Math.min(3, this.config.maxTurns);

      if (phaseComplete && this.turnCount >= minTurns) {
        const reply = '感谢你的信息！访谈完成。现在开始运行六阶段诊断分析...';
        for (const ch of reply) {
          display(ch);
          await sleep(5); // P3-06: 20ms→5ms 更流畅的流式体验
        }
        this.viewAdapter?.showAgentMessage(reply);
        this.messages.push({ role: 'assistant', content: reply });
        this.phase = 1;
        return { reply, phaseComplete: true };
      }

      const reply = await this.streamWithToolLoop(display);
      this.messages.push({ role: 'assistant', content: reply });
      return { reply, phaseComplete: false };
    }

    const reply = await this.streamWithToolLoop(display);
    this.messages.push({ role: 'assistant', content: reply });
    return { reply, phaseComplete: false };
  }

  // ═══ Diagnosis Orchestrator Integration (delegated to DiagnosisLauncher) ═══

  async startDiagnosis(
    initiatorRole: string,
    initiatorName: string,
    onEvent?: (event: DiagnosisEvent) => void,
  ): Promise<ConsultationResult | null> {
    return this.diagnosisLauncher.startDiagnosis(initiatorRole, initiatorName, onEvent);
  }

  // ═══ Serialization ═══

  /**
   * Serialize current engine state for storage/restore.
   * LLMProvider is NOT serialized — caller must provide provider on restore.
   */
  serialize(): EngineState {
    return {
      orgId: this.orgId,
      phase: this.phase,
      messages: [...this.messages],
      startedAt: new Date().toISOString(),
    };
  }

  /**
   * Restore engine from a previously serialized state.
   * Provider must be supplied (not stored in state).
   */
  static fromState(provider: LLMProvider, state: EngineState): ConversationEngine {
    const engine = new ConversationEngine(provider, { orgId: state.orgId });
    engine.phase = state.phase;
    engine.messages = [...state.messages];
    return engine;
  }

  // ═══ Private: LLM + Tool Loop (delegated to ToolLoopExecutor) ═══

  private async callLLMWithTools(): Promise<string> {
    return this.toolLoop.callLLMWithTools();
  }

  private async streamWithToolLoop(onToken: (token: string) => void): Promise<string> {
    return this.toolLoop.streamWithToolLoop(onToken);
  }

  // ═══ Private: Helpers ═══

  /**
   * Detect if user input signals readiness to end Phase 0.
   * Uses simple keyword matching — not LLM.
   */
  private detectPhaseComplete(input: string): boolean {
    const signals = [
      '没有了', '就这些', '差不多了', '可以了',
      '开始诊断', '开始分析', '好的', 'ok', '没问题',
    ];
    return signals.some(s => input.toLowerCase().includes(s));
  }
}

// ═══ Utility ═══

import type { DiagnosisEngine } from '../l2-interfaces/diagnosis-engine';

/** 铁律 39: 无 engine 注入时的安全降级 — 返回明确错误而非崩溃 */
function createNoopEngine(): DiagnosisEngine {
  return {
    async runConsultation(_teamId, _initiator, onEvent) {
      onEvent?.({ type: 'error', phase: 0, label: '引擎未配置', message: 'DiagnosisEngine 未注入 — 请在 server.ts 中配置 EngineCoreVendorAdapter' });
      return { teamId: _teamId, report: { error: '引擎未配置' }, totalDurationMs: 0, degradedModules: ['engine'] };
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
