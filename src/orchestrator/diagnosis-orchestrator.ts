/**
 * orchestrator/diagnosis-orchestrator.ts — 泛型编排器骨架 (Iter 2)
 *
 * 对标 Claw-Code ConversationRuntime<C, T>:
 *   - 泛型 LLM 客户端接口 (ApiClient trait)
 *   - 泛型工具执行器接口 (ToolExecutor trait)
 *   - Builder 模式 (with_* 方法)
 *   - 六阶段状态机驱动的诊断流程
 *
 * engine-core 旧编排器降级为纯函数模块库:
 *   computeModule(moduleName, input) → ModuleResult
 *   不参与相位推进。
 */
import { PhaseStateMachine } from './phase-state-machine';
import type { PhaseConfig } from './phase-state-machine';
import type { EventBus } from './event-bus';
import { createLogger } from '../logger';

const log = createLogger('orchestrator');

// ═══ Generic Traits (对标 Claw-Code) ═══

/** LLM 客户端接口 (对标 Claw-Code ApiClient trait) */
export interface LLMClient {
  consult(systemPrompt: string, userMessage: string, options?: { temperature?: number; maxTokens?: number }): Promise<LLMResponse>;
}

export interface LLMResponse {
  content: string;
  model: string;
}

/** 工具执行器接口 (对标 Claw-Code ToolExecutor trait) */
export interface ToolExecutor {
  execute(toolName: string, input: string): Promise<ToolResult>;
}

export interface ToolResult {
  content: string;
  isError?: boolean;
}

// ═══ Orchestrator Config ═══

export interface OrchestratorConfig {
  phaseConfigs: Record<number, PhaseConfig>;
  maxIterations: number;
  gateDataCompleteness: number;       // Phase 1→2 门控: 最低证据比例
  gateMinHypothesisConfidence: number; // Phase 2→3 门控: 最低假设置信度
  autoCompactionThreshold: number;     // 自动压缩阈值 (tokens)
}

const DEFAULT_PHASE_CONFIGS: Record<number, PhaseConfig> = {
  0: { label: '组织访谈',      required: true, maxDurationMs: 600_000 },
  1: { label: '数据采集',      required: true, maxDurationMs: 120_000 },
  2: { label: '假设生成',      required: true, maxDurationMs: 300_000 },
  3: { label: '根因分析',      required: true, maxDurationMs: 180_000 },
  4: { label: '报告生成',      required: true, maxDurationMs: 60_000 },
  5: { label: '交付',          required: true, maxDurationMs: 120_000 },
};

const DEFAULT_CONFIG: OrchestratorConfig = {
  phaseConfigs: DEFAULT_PHASE_CONFIGS,
  maxIterations: 5,
  gateDataCompleteness: 0.4,
  gateMinHypothesisConfidence: 0.5,
  autoCompactionThreshold: 100_000,
};

// ═══ DiagnosisOrchestrator ═══

export class DiagnosisOrchestrator<C extends LLMClient, T extends ToolExecutor> {
  private llmClient: C;
  private toolExecutor: T;
  private stateMachine: PhaseStateMachine;
  private eventBus: EventBus | null = null;
  private config: OrchestratorConfig;

  constructor(llmClient: C, toolExecutor: T, config?: Partial<OrchestratorConfig>) {
    this.llmClient = llmClient;
    this.toolExecutor = toolExecutor;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.stateMachine = new PhaseStateMachine(this.config.phaseConfigs);
  }

  // ═══ Builder Pattern (对标 Claw-Code with_* / #[must_use]) ═══

  withEventBus(bus: EventBus): this {
    this.eventBus = bus;
    return this;
  }

  withPhaseConfig(phase: number, cfg: Partial<PhaseConfig>): this {
    this.config.phaseConfigs[phase] = { ...this.config.phaseConfigs[phase], ...cfg };
    return this;
  }

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

  withAutoCompactionThreshold(tokens: number): this {
    this.config.autoCompactionThreshold = tokens;
    return this;
  }

  // ═══ Public API ═══

  getStateMachine(): PhaseStateMachine { return this.stateMachine; }
  getLLMClient(): C { return this.llmClient; }
  getToolExecutor(): T { return this.toolExecutor; }

  /** Advance the state machine and emit phase.started event */
  advancePhase(): { phase: number; label: string } {
    const result = this.stateMachine.advance();
    if (result.phase >= 0) {
      this.eventBus?.emit({
        id: `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'phase.started',
        consultationId: '',  // set by caller
        phase: result.phase,
        data: { label: result.label },
        traceId: '', spanId: '',
        timestamp: new Date().toISOString(),
      });
      log.info({ phase: result.phase, label: result.label }, 'Phase 已启动');
    }
    return result;
  }

  /** Check if the orchestrator is still running */
  isRunning(): boolean {
    const state = this.stateMachine.getState();
    return state === 'running' || state === 'paused';
  }

  /** Abort the consultation */
  abort(reason: string): void {
    this.stateMachine.abort(reason);
    this.eventBus?.emit({
      id: `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      type: 'consultation.aborted',
      consultationId: '', phase: this.stateMachine.getCurrentPhase(),
      data: { reason },
      traceId: '', spanId: '',
      timestamp: new Date().toISOString(),
    });
  }
}
