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
import type { PhaseStateMachine } from '../orchestrator/phase-state-machine';
import type { PIIScrubber } from '../security/pii-scrubber';
import type { SessionManager } from '../orchestrator/session-manager';
import type { EventBus } from '../orchestrator/event-bus';
import type { EvidenceCollector, CorroborationEngine } from '../evidence/index';
// EC-03: L2 只依赖 L4 类型 (接口契约), 运行时通过 diagnosis-launcher (L3) 调用
import type { GraphStore } from '../l4/graph-bridge';
import type { createGraphBridge } from '../l4/graph-bridge';
import type { ReportGraphAdapter } from '../l4/report-graph-adapter';
import type { DecisionInput, DecisionResult } from '../l4/decision-capture';
import type { DiagnosticPath, SubgraphSummary, BrokerNode, GraphDiff } from '../l4/diagnosis-graph-query';
import type { Triple, ReflectionResult } from '../l4/triple-reflection';
import type { L3ResolutionResult } from '../l4/entity-resolver';
import type { CommunityReport } from '../l4/community-reports';
// P1-01: 子组件提取 — 单体引擎拆分为 3 个独立类
import { ToolLoopExecutor } from './tool-loop-executor';
import { DiagnosisLauncher, type DiagnosisEvent, type ConsultationResult } from './diagnosis-launcher';
import { OntologySyncer, type OntologySyncResult } from './ontology-syncer';
import type { EngineContext } from './engine-context';
import { EngineCoreVendorAdapter } from '../adapters/engine-core-adapter';

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
  /** 编排层: PhaseStateMachine (Batch 2: 状态机驱动 Phase 转换) */
  phaseStateMachine?: PhaseStateMachine;
  /** PII 脱敏: 用户输入出站到云 LLM 前脱敏 */
  piiScrubber?: PIIScrubber;
  /** 会话 ID (用于事件追踪) */
  sessionId?: string;
  /** L3: EvidenceCollector (Phase 0 证据采集) */
  evidenceCollector?: EvidenceCollector;
  /** L4: GraphBridge (Phase 1 自动写入本体图) */
  graphBridge?: ReturnType<typeof createGraphBridge>;
  /** L2: ExpertRouter (多专家路由协调者) */
  expertRouter?: import('../l2/expert-router').ExpertRouter;
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
  /** FED-001: 联邦进化适配器 */
  federalAdapter?: import('../adapters/federal-adapter').FederalAdapter;
}

export interface ProcessResult {
  /** Agent 回复文本 */
  reply: string;
  /** Phase 0 是否完成，可以推进到 Phase 1 */
  phaseComplete: boolean;
}

export type EngineState = {
  orgId: string;
  phase: number;
  messages: LLMMessage[];
  startedAt: string;
}

/** @deprecated 使用 EngineState。保留用于 TUI/CLI 后向兼容。 */
export type ConversationState = EngineState;

// ═══ Hermes P0-2: 三层系统提示 — DeepSeek Prefix Cache 优化 ═══
//
// 层 1: 稳定层 — 会话期间不变 (Prefix Cache 命中)
// 层 2: 上下文层 — Phase 变化时更新
// 层 3: 易变层 — 每轮更新 (放在 user message 前, 不影响 Cache)
// 参考: Hermes system_prompt.py build_system_prompt() 三层组装

const STABLE_LAYER = `你是 Synova，一个 AI 组织诊断助手。

你的角色是"组织医生"——通过结构化访谈了解用户组织的情况，然后运行六阶段诊断分析。

规则：
- 每次只问 1-2 个问题，不要一次问太多
- 引用用户上一轮的回复，表现出你在认真倾听
- 收集到足够信息后，告知用户"访谈完成，开始运行诊断分析"
- 用中文回复，专业但不冷漠
- 回复控制在 100-200 字`;

function buildContextLayer(phase: number): string {
  switch (phase) {
    case 0:
      return `## 当前阶段：Phase 0（组织访谈）
你要做的是：
1. 了解组织名称、规模、行业
2. 了解当前最关心的问题/痛点
3. 了解组织架构（团队数量、关键角色）
4. 确认诊断深度和范围

## 对话规则
- 每个问题附带"为什么这么问"
- 形成假设时邀请反驳："我的初步判断是……但可能判断错了"
- 用户连续表达相似意思时，主动问"需要我开始诊断吗？"
- 覆盖 ≥4 维度可建议结束访谈`;
    case 1:
      return `## 当前阶段：Phase 1（数据采集）
系统正在从连接的数据源采集信息。继续与用户对话，引导提供更多细节。`;
    default:
      return `## 当前阶段：Phase ${phase}
继续诊断分析，基于已有信息推进。`;
  }
}

/** GNS: 根据维度覆盖生成动态追问提示 */
function buildCoverageContext(
  coverage: Map<string, { status: string; confidence: number; evidenceCount: number }>,
  dimensionRegistry?: { get(id: string): { name: string } | undefined } | null,
): string {
  if (!coverage || coverage.size === 0) return '';
  const covered = [...coverage.entries()].filter(([, v]) => v.status === 'covered');
  const partial = [...coverage.entries()].filter(([, v]) => v.status === 'partial');
  const uncovered = DIMENSION_NAMES.filter(d => !coverage.has(d));

  const lines: string[] = [];
  if (covered.length > 0) {
    lines.push(`已了解: ${covered.map(([k]) => dimensionRegistry?.get(k)?.name || k).join('、')}`);
  }
  if (partial.length > 0) {
    lines.push(`部分了解: ${partial.map(([k]) => dimensionRegistry?.get(k)?.name || k).join('、')}`);
  }
  if (uncovered.length > 0) {
    lines.push(`待了解: ${uncovered.map(k => dimensionRegistry?.get(k)?.name || k).join('、')}`);
  }
  if (covered.length >= 4) {
    lines.push('信息已较充分——可以建议用户开始诊断。');
  } else if (partial.length > 0 || uncovered.length > 0) {
    const next = partial[0]?.[0] || uncovered[0] || '';
    const name = dimensionRegistry?.get(next)?.name || next;
    lines.push(`优先追问: ${name}`);
  }
  return lines.join('\n');
}

/** 六维度名称 (fallback，无 DimensionRegistry 时使用) */
const DIMENSION_NAMES = [
  'mission_objectives', 'business_value', 'current_state',
  'resource_constraints', 'risk_bottlenecks', 'success_criteria',
];

function buildVolatileLayer(turnCount: number, phase: number): string {
  return `[轮次: ${turnCount}] [阶段: ${phase}/5]`;
}

function buildSystemPrompt(
  phase: number, turnCount: number,
  coverage?: Map<string, { status: string; confidence: number; evidenceCount: number }>,
  dimensionRegistry?: { get(id: string): { name: string } | undefined } | null,
): string {
  const context = buildContextLayer(phase);
  const covText = coverage ? buildCoverageContext(coverage, dimensionRegistry) : '';
  return [
    STABLE_LAYER,
    context,
    covText,
  ].filter(Boolean).join('\n\n---\n\n');
  // 易变层不放入 system prompt — 追加到 user message 末尾保护 Cache
}

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
  private expertRouter: import('../l2/expert-router').ExpertRouter | null = null;
  private dimensionRegistry: DimensionRegistry | null = null;
  private hookRunner: HookRunner | null = null;
  private sessionManager: SessionManager | null = null;
  private eventBus: EventBus | null = null;
  private phaseStateMachine: PhaseStateMachine | null = null;
  private piiScrubber: PIIScrubber | null = null;
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
    } as Required<EngineConfig>;
    this.messages = [{ role: 'system', content: buildSystemPrompt(0, 0, this.dimensionCoverage, this.dimensionRegistry) }];
    this.toolRegistry = new ToolRegistry();

    // 编排层接线: 接收可选组件
    this.intentRouter = config.intentRouter || null;
    this.expertRouter = config.expertRouter || null;
    this.dimensionRegistry = config.dimensionRegistry || null;
    this.hookRunner = config.hookRunner || null;
    this.sessionManager = config.sessionManager || null;
    this.eventBus = config.eventBus || null;
    this.phaseStateMachine = config.phaseStateMachine || null;
    this.piiScrubber = config.piiScrubber || null;
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
      corroborationEngine: this.corroborationEngine,
      graphBridge: this.graphBridge,
      graphStore: this.graphStore,
      diagnosisEngine,
      createGraphStore: (db) => EngineCoreVendorAdapter.createGraphStore(db),
      federalAdapter: config.federalAdapter,
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

  // EC-03: L4 运行时调用已从 ConversationEngine 移除。
  // 所有 L4 操作由 diagnosis-launcher.ts (L2→L3→L4 正确路径) 处理。

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

  /** Advance to next phase (Hermes P0-2: 重建 system prompt 以更新上下文层) */
  advancePhase(): void {
    this.phase++;
    this.messages[0] = { role: 'system', content: buildSystemPrompt(this.phase, this.turnCount, this.dimensionCoverage, this.dimensionRegistry) };
    log.debug({ phase: this.phase }, 'Phase 推进, system prompt 已更新');
  }

  /** Get message history (shallow copy) */
  getMessages(): LLMMessage[] {
    return [...this.messages];
  }

  /** Get tool registry for registration/inspection */
  getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }

  // ═══ GNS v2.0: Phase 0 访谈摘要持久化 ═══

  private async persistInterviewSummary(coveredCount: number): Promise<void> {
    if (!this.graphStore) return;
    try {
      const dimensions: Record<string, { summary: string; keyPoints: string[]; confidence: number }> = {};
      for (const [id, cov] of this.dimensionCoverage) {
        const msgs = this.messages
          .filter(m => m.role === 'user')
          .map(m => m.content);
        dimensions[id] = {
          summary: msgs.slice(-3).join('; ').slice(0, 200),
          keyPoints: msgs.filter(m => m.includes(id)).slice(0, 3),
          confidence: cov.confidence,
        };
      }
      // Use GOAL node as InterviewSummary carrier (v2.0: type='InterviewSummary')
      this.graphStore.createNode(
        'Goal' as unknown as Parameters<typeof this.graphStore.createNode>[0],
        {
          name: `Phase0_Interview_${this.orgId}_${Date.now().toString(36)}`,
          description: `Phase 0 访谈摘要 — ${coveredCount}/6 维度已覆盖`,
          goalType: 'mission' as unknown as string,
          progress: coveredCount / 6,
        },
        this.orgId || 'default',
      );
      log.info({ coveredCount, orgId: this.orgId }, 'Phase 0 访谈摘要已持久化');
    } catch (err: any) {
      log.warn({ err }, 'InterviewSummary 持久化失败');
    }
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
    // PII 脱敏: 出站到云 LLM 前脱敏 (S4移除 + S3脱敏 + S2角色掩盖)
    const input = this.piiScrubber?.scrub(userInput, 'S2').cleaned ?? userInput;
    // Hermes P0-2: 易变层追加到 user message — 保护 Prefix Cache
    this.messages.push({ role: 'user', content: `${input}\n\n${buildVolatileLayer(this.turnCount, this.phase)}` });

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
      // 无 IntentRouter 时跳过维度覆盖要求 — 纯轮次+显式完成判断
      const dimensionsReady = this.intentRouter ? coveredCount >= 4 : true;
      const minTurns = this.intentRouter ? Math.min(3, this.config.maxTurns) : 2;

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
        // Batch 2: PhaseStateMachine 驱动 — 替代硬编码 phase=1
        if (this.phaseStateMachine) {
          const next = this.phaseStateMachine.advance();
          log.info({ nextPhase: next.phase, label: next.label }, '状态机推进');
        }
        this.phase = 1;

        // GNS v2.0: Phase 0 完成 → 持久化 InterviewSummary 到 GraphStore
        this.persistInterviewSummary(coveredCount).catch(err => {
          log.warn({ err }, 'InterviewSummary 持久化失败 — degraded');
        });
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
    // PII 脱敏: 出站到云 LLM 前脱敏 (S4移除 + S3脱敏 + S2角色掩盖)
    const input = this.piiScrubber?.scrub(userInput, 'S2').cleaned ?? userInput;
    // Hermes P0-2: 易变层追加到 user message — 保护 Prefix Cache
    this.messages.push({ role: 'user', content: `${input}\n\n${buildVolatileLayer(this.turnCount, this.phase)}` });

    // L1 decoupling: onToken 已处理 TUI 显示，不再重复调用 viewAdapter
    const display = (token: string) => {
      onToken(token);
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
    // L2 ExpertRouter: 根据 Phase 选择专家策略
    if (this.expertRouter) {
      const selection = await this.expertRouter.route(initiatorName, {
        phase: this.phase,
        orgSize: this.orgId,
      });
      // 将 ExpertSelection 传给 diagnosisLauncher（SubAgentCoordinator 消费）
      (this.diagnosisLauncher as { setExpertSelection?: (s: unknown) => void }).setExpertSelection?.(selection);
    }
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
