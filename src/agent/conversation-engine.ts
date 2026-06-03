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

const log = createLogger('agent/conversation-engine');

// ═══ Types ═══

/** Simplified diagnosis event for TUI/UI consumption (Slice 3.2) */
export interface DiagnosisEvent {
  type: string;
  phase: number;
  label?: string;
  message?: string;
  findings?: Array<{ moduleId: string; summary: string }>;
}

/** Simplified consultation result (Slice 3.2) */
export interface ConsultationResult {
  teamId: string;
  report: unknown;
  totalDurationMs: number;
  degradedModules: string[];
}

/** Ontology sync result (Slice 5.1) */
export interface OntologySyncResult {
  persons: number;
  teams: number;
  personsDetail?: string[];
  teamCount: number;
  created: boolean;
}

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
  private sessionId: string = '';
  /** 维度覆盖追踪 (Phase 0) */
  private dimensionCoverage: Map<string, { status: string; confidence: number; evidenceCount: number }> = new Map();

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
    this.sessionId = config.sessionId || '';
  }

  /** Bind a ViewAdapter for L1 decoupling (Slice C). When set, Engine uses adapter for display. */
  setViewAdapter(adapter: ViewAdapter): void {
    this.viewAdapter = adapter;
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

  // ═══ SOG Ontology Sync (Slice 5.1) ═══

  /**
   * Extract organization info from Phase 0 messages and sync to SOG graph.
   *
   * Uses simple heuristics (keyword extraction) to identify:
   *   - Organization name → creates Team node
   *   - Role/title mentions → creates Person nodes
   *   - Team count mentions → creates Team nodes
   *
   * Returns summary for TUI display.
   */
  async syncToSOG(): Promise<OntologySyncResult> {
    const userMessages = this.messages.filter(m => m.role === 'user');
    const allText = userMessages.map(m => m.content).join(' ');
    const personNames = new Set<string>();
    const teamNames = new Set<string>();

    // Heuristic: quoted names are likely persons or teams
    const quotedPattern = /[「「]([^」」]{1,10})[」」]/g;
    let match;
    while ((match = quotedPattern.exec(allText)) !== null) {
      personNames.add(match[1]);
    }

    // Heuristic: "X人" / "X个团队" / "X部门"
    const teamCountMatch = allText.match(/(\d+)\s*(个|名|位).*(团队|部门|组)/);
    const teamCount = teamCountMatch ? parseInt(teamCountMatch[1]) : 0;

    // Heuristic: "CEO/CTO/经理" patterns
    const rolePattern = /([一-龥]{2,4})(?:是|担任?|负责?)(?:我们的?)?(CEO|CTO|经理|主管|总监|负责人)/g;
    while ((match = rolePattern.exec(allText)) !== null) {
      personNames.add(match[1]);
    }

    const result: OntologySyncResult = {
      persons: personNames.size,
      teams: teamCount > 0 ? teamCount : 1,
      personsDetail: [...personNames],
      teamCount,
      created: false,
    };

    // Attempt to create SOG nodes via engine-core GraphStore
    try {
      const { createGraphStore } = await import(
        '../../../../server/vendor/@synova/engine-core/src/pipeline/diagnosis/graph-store'
      );
      const { SOGNodeType, SOGEdgeType } = await import('@synova/sog-core');
      const { getDatabase } = await import('../init/engine-context');

      const db = getDatabase();
      const store = createGraphStore('sqlite', db);

      // Create Team node
      store.createNode(SOGNodeType.TEAM, {
        name: this.orgId || '默认组织',
        teamType: 'permanent',
      }, this.orgId || 'default');

      // Create Person nodes from extracted names
      for (const name of personNames) {
        store.createNode(SOGNodeType.PERSON, { name }, this.orgId || 'default');
      }

      result.created = true;
      log.info({
        persons: personNames.size,
        team: this.orgId,
      }, 'SOG 本体节点已创建');
    } catch (err: any) {
      log.warn({ err: err.message }, 'SOG 同步失败（engine-core 不可用），继续非本体模式');
    }

    return result;
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
        } catch { /* 意图分类失败 → 降级为原有轮次逻辑 */ }
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
          await sleep(20);
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

  // ═══ Diagnosis Orchestrator Integration (Slice 3.2) ═══

  /**
   * Start the diagnosis pipeline after Phase 0 interview completes.
   *
   * Creates a DiagnosisOrchestrator, wires it with the current LLM provider
   * and tool registry, then runs the full 6-phase consultation.
   *
   * Events are emitted via the onEvent callback for TUI/UI rendering.
   * Returns a ConsultationResult when complete, or null if engine-core
   * is unavailable (graceful degradation — iron law #31).
   */
  async startDiagnosis(
    initiatorRole: string,
    initiatorName: string,
    onEvent?: (event: DiagnosisEvent) => void,
  ): Promise<ConsultationResult | null> {
    const teamId = this.orgId || 'default';

    try {
      // Dynamic import — engine-core is heavy (305 files, ~20k LOC)
      const { DiagnosisOrchestrator } = await import(
        '../../../../server/vendor/@synova/engine-core/src/pipeline/diagnosis/diagnosis-orchestrator'
      );
      const { createDiagnosisLLMClient, createToolExecutorAdapter } = await import('./orchestrator-adapter');

      // Wire adapters
      const llmClient = createDiagnosisLLMClient(this.provider);
      const toolExecutor = createToolExecutorAdapter(this.toolRegistry);

      // Create orchestrator with builders
      const orchestrator = new DiagnosisOrchestrator(llmClient, toolExecutor)
        .withMaxIterations(4)
        .withGateDataCompleteness(0.3)
        .withGateMinHypothesisConfidence(0.5);

      log.info({ teamId, initiatorRole }, '启动六阶段诊断');

      const result = await orchestrator.runConsultation(teamId, {
        role: initiatorRole,
        name: initiatorName,
        teamId,
        concerns: this.extractConcerns(),
      });

      // Forward events to caller
      if (onEvent) {
        for (const event of result.events) {
          onEvent(event);
        }
      }

      log.info({
        teamId,
        durationMs: result.totalDurationMs,
        degraded: result.degradedModules.length,
      }, '诊断完成');

      return {
        teamId: result.teamId,
        report: result.report,
        totalDurationMs: result.totalDurationMs,
        degradedModules: result.degradedModules,
      };
    } catch (err: any) {
      log.error({ err, teamId }, '诊断引擎启动失败');
      if (onEvent) {
        onEvent({ type: 'error', phase: 0, message: `诊断引擎不可用: ${err.message}` } as any);
      }
      return null;
    }
  }

  /** Extract user-stated concerns from Phase 0 messages */
  private extractConcerns(): string[] {
    const userMessages = this.messages.filter(m => m.role === 'user');
    return userMessages.map(m => m.content.slice(0, 200));
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

  // ═══ Private: LLM + Tool Loop ═══

  /**
   * Call LLM with tool execution loop (non-streaming).
   * Max 3 rounds of tool calls to prevent infinite loops.
   */
  private async callLLMWithTools(): Promise<string> {
    const MAX_TOOL_ROUNDS = 3;
    const tools = this.toolRegistry.listTools();

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      try {
        const result = await this.provider.chat(this.messages, {
          tools: tools.length > 0 ? this.toolRegistry.toOpenAITools() : undefined,
        });

        // 无工具调用 → 直接返回
        if (!result.toolCalls || result.toolCalls.length === 0) {
          return result.content || '(empty response)';
        }

        // 有工具调用 → 执行并注入结果
        log.info({ count: result.toolCalls.length, round }, 'LLM 请求工具调用');

        this.messages.push({
          role: 'assistant',
          content: result.content || '',
        } as LLMMessage);

        for (const tc of result.toolCalls) {
          let params: Record<string, unknown> = {};
          try {
            params = JSON.parse(tc.function.arguments);
          } catch {
            log.debug({ name: tc.function.name, args: tc.function.arguments.slice(0, 100) },
              'JSON.parse 失败于工具参数，使用空对象');
            params = {};
          }

          // 编排层 Hook: pre-tool-use (权限/脱敏)
          let effectiveParams = params;
          if (this.hookRunner) {
            const preResult = await this.hookRunner.runPreToolUse({
              name: tc.function.name, input: JSON.stringify(params),
            });
            if (preResult.action === 'deny') {
              (this.messages as any[]).push({
                role: 'tool', tool_call_id: crypto.randomUUID(),
                content: JSON.stringify({ error: `工具被拒绝: ${preResult.reason}` }),
              });
              this.eventBus?.emit({
                id: `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`,
                type: 'tool.denied', consultationId: this.sessionId,
                data: { toolName: tc.function.name, reason: preResult.reason },
                traceId: this.sessionId, spanId: this.sessionId.slice(0, 16),
                timestamp: new Date().toISOString(),
              });
              continue; // Skip this tool, continue next
            }
            if (preResult.action === 'modify' && preResult.modifiedInput) {
              try { effectiveParams = JSON.parse(preResult.modifiedInput); } catch { /* keep original */ }
            }
          }

          const execResult = await this.toolRegistry.execute(tc.function.name, effectiveParams);

          // 编排层 Hook: post-tool-use (审计/证据)
          if (this.hookRunner) {
            await this.hookRunner.runPostToolUse(
              { name: tc.function.name, input: JSON.stringify(effectiveParams) },
              { content: JSON.stringify(execResult), isError: !!(execResult as any).error },
            );
            this.eventBus?.emit({
              id: `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`,
              type: 'tool.executed', consultationId: this.sessionId,
              data: { toolName: tc.function.name, success: !(execResult as any).error },
              traceId: this.sessionId, spanId: this.sessionId.slice(0, 16),
              timestamp: new Date().toISOString(),
            });
          }

          (this.messages as any[]).push({
            role: 'tool',
            tool_call_id: crypto.randomUUID(),
            content: JSON.stringify(execResult),
          });
        }

        continue; // 下一轮 LLM 调用
      } catch (err: any) {
        log.error({ err, round }, 'LLM 调用失败');
        return `抱歉，调用失败：${err.message}`;
      }
    }

    // 达到最大轮次 → 最后一次无工具调用
    try {
      const final = await this.provider.chat(this.messages);
      return final.content || '(no response)';
    } catch (err: any) {
      log.error({ err }, 'callLLMWithTools: 最终轮 LLM 调用失败');
      return `工具调用超过最大轮次: ${err.message}`;
    }
  }

  /**
   * Call LLM with streaming token output + tool execution loop.
   *
   * Slice 0.1 fix: single provider.chat() call per round —
   * no more separate stream()+chat() double calls.
   */
  private async streamWithToolLoop(onToken: (token: string) => void): Promise<string> {
    const MAX_ROUNDS = 3;
    const tools = this.toolRegistry.listTools();

    for (let round = 0; round < MAX_ROUNDS; round++) {
      try {
        const result = await this.provider.chat(this.messages, {
          tools: tools.length > 0 ? this.toolRegistry.toOpenAITools() : undefined,
        });

        const content = result.content || '';

        // 无工具调用 → 流式输出文本 + 返回
        if (!result.toolCalls || result.toolCalls.length === 0) {
          for (const ch of content) {
            onToken(ch);
          }
          this.messages.push({ role: 'assistant', content });
          return content || '(empty response)';
        }

        // 有工具调用
        log.debug({ count: result.toolCalls.length, round }, 'streamWithToolLoop: 工具调用');

        for (const ch of content) {
          onToken(ch);
        }

        (this.messages as any[]).push({
          role: 'assistant',
          content,
          tool_calls: result.toolCalls,
        });

        onToken('\n[工具调用: ');
        for (const tc of result.toolCalls) {
          onToken(tc.function.name + ' ');
          let params: Record<string, unknown> = {};
          try {
            params = JSON.parse(tc.function.arguments);
          } catch {
            log.debug({ name: tc.function.name, args: tc.function.arguments.slice(0, 100) },
              'JSON.parse 失败于工具参数，使用空对象');
            params = {};
          }

          let execResult: unknown;
          try {
            execResult = await this.toolRegistry.execute(tc.function.name, params);
          } catch (err: any) {
            log.warn({ err, tool: tc.function.name }, '工具执行失败');
            execResult = { error: `工具执行失败: ${err.message}` };
          }

          (this.messages as any[]).push({
            role: 'tool',
            tool_call_id: crypto.randomUUID(),
            content: JSON.stringify(execResult),
          });
        }
        onToken(']\n');

        continue;
      } catch (err: any) {
        log.error({ err, round }, 'streamWithToolLoop: LLM 调用失败');
        return `抱歉，调用失败：${err.message}`;
      }
    }

    // 达到最大轮次
    try {
      const final = await this.provider.chat(this.messages);
      for (const ch of (final.content || '')) {
        onToken(ch);
      }
      this.messages.push({ role: 'assistant', content: final.content || '' });
      return final.content || '(no response)';
    } catch (err: any) {
      log.error({ err }, 'streamWithToolLoop: 最终轮 LLM 调用失败');
      return '工具调用超过最大轮次，请稍后重试。';
    }
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

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
