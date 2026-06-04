/**
 * orchestrator/phase-state-machine.ts — 六阶段状态机 (Iter 2)
 *
 * 诊断主循环是六阶段状态机，不是 LLM 对话循环。
 * 每个 Phase 有 enter/execute/exit 三个生命周期。
 * 状态变更必须通过事件触发 (Event Sourcing)。
 */
import { createLogger } from '../logger';

const log = createLogger('orchestrator/state-machine');

// ═══ Types ═══

export type MachineState = 'idle' | 'running' | 'paused' | 'completed' | 'aborted';

export interface PhaseConfig {
  label: string;
  required: boolean;
  maxDurationMs: number;
  canSkip?: boolean;
}

export interface PhaseState {
  currentPhase: number;
  state: MachineState;
  phaseStartedAt: Record<number, string>;
  phaseCompletedAt: Record<number, string>;
  abortReason?: string;
}

type PhaseCallback = () => void | Promise<void>;

// ═══ PhaseStateMachine ═══

export class PhaseStateMachine {
  private currentPhase = -1;        // -1 = IDLE
  private state: MachineState = 'idle';
  private phaseStartedAt: Record<number, number> = {}; // epoch ms
  private phaseCompletedAt: Record<number, string> = {};
  private abortReason: string | undefined;
  private config: Record<number, PhaseConfig>;
  /** GNS v2.0: 最大 Phase 数 (默认 5 = 六阶段诊断, 9 = 含导航) */
  readonly maxPhases: number;

  private enterCallbacks = new Map<number, PhaseCallback[]>();
  private exitCallbacks = new Map<number, PhaseCallback[]>();

  constructor(config: Record<number, PhaseConfig>) {
    this.config = config;
    this.maxPhases = Math.max(...Object.keys(config).map(Number), 5);
  }

  // ═══ Public ═══

  getCurrentPhase(): number { return this.currentPhase; }
  getState(): MachineState { return this.state; }
  getAbortReason(): string | undefined { return this.abortReason; }
  getPhaseConfig(phase: number): PhaseConfig | undefined { return this.config[phase]; }
  getPhaseElapsedMs(): number {
    if (this.currentPhase < 0) return 0;
    const start = this.phaseStartedAt[this.currentPhase];
    return start ? Date.now() - start : 0;
  }

  /** Check if current phase has exceeded its max duration */
  isCurrentPhaseTimedOut(): boolean {
    const cfg = this.config[this.currentPhase];
    if (!cfg) return false;
    return this.getPhaseElapsedMs() > cfg.maxDurationMs;
  }

  // ═══ Lifecycle ═══

  /** Advance to next phase. Returns phase info or null if completed. */
  advance(): { phase: number; label: string } {
    if (this.state === 'completed' || this.state === 'aborted') {
      return { phase: -1, label: '' };
    }

    const prevPhase = this.currentPhase;
    const nextPhase = prevPhase + 1;

    // Exit previous phase
    if (prevPhase >= 0) {
      this.phaseCompletedAt[prevPhase] = new Date().toISOString();
      this.fireCallbacks(this.exitCallbacks.get(prevPhase));
      log.debug({ phase: prevPhase }, 'Phase 退出');
    }

    // Check completion
    if (nextPhase > this.maxPhases) {
      this.state = 'completed';
      log.info('所有 Phase 完成');
      return { phase: -1, label: '' };
    }

    // Enter next phase (skip non-required phases)
    let effectivePhase = nextPhase;
    while (effectivePhase <= 5) {
      const cfg = this.config[effectivePhase];
      if (!cfg || cfg.required) break;
      log.debug({ phase: effectivePhase }, '跳过非必需 Phase');
      effectivePhase++;
    }

    if (effectivePhase > this.maxPhases) {
      this.state = 'completed';
      return { phase: -1, label: '' };
    }

    this.currentPhase = effectivePhase;
    this.state = 'running';
    this.phaseStartedAt[effectivePhase] = Date.now();
    this.fireCallbacks(this.enterCallbacks.get(effectivePhase));

    const cfg = this.config[effectivePhase];
    log.info({ phase: effectivePhase, label: cfg?.label }, 'Phase 进入');
    return { phase: effectivePhase, label: cfg?.label || `Phase ${effectivePhase}` };
  }

  /** Skip to a specific phase (non-required phases between are skipped) */
  skipTo(targetPhase: number): { phase: number; label: string } {
    if (targetPhase <= this.currentPhase) {
      throw new Error(`Cannot skip backward from ${this.currentPhase} to ${targetPhase}`);
    }

    // Verify no required phases are being skipped
    for (let p = this.currentPhase + 1; p < targetPhase; p++) {
      const cfg = this.config[p];
      if (cfg && cfg.required) {
        throw new Error(`Cannot skip required phase ${p}`);
      }
    }

    // Exit current phase
    if (this.currentPhase >= 0) {
      this.fireCallbacks(this.exitCallbacks.get(this.currentPhase));
    }

    this.currentPhase = targetPhase;
    this.phaseStartedAt[targetPhase] = Date.now();
    this.fireCallbacks(this.enterCallbacks.get(targetPhase));

    const cfg = this.config[targetPhase];
    return { phase: targetPhase, label: cfg?.label || `Phase ${targetPhase}` };
  }

  pause(): void {
    if (this.state !== 'running') return;
    this.state = 'paused';
    log.info({ phase: this.currentPhase }, '状态机暂停');
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.state = 'running';
    log.info({ phase: this.currentPhase }, '状态机恢复');
  }

  abort(reason: string): void {
    this.state = 'aborted';
    this.abortReason = reason;
    log.warn({ phase: this.currentPhase, reason }, '状态机中止');
  }

  // ═══ Callbacks ═══

  onPhaseEnter(phase: number, callback: PhaseCallback): void {
    if (!this.enterCallbacks.has(phase)) this.enterCallbacks.set(phase, []);
    this.enterCallbacks.get(phase)!.push(callback);
  }

  onPhaseExit(phase: number, callback: PhaseCallback): void {
    if (!this.exitCallbacks.has(phase)) this.exitCallbacks.set(phase, []);
    this.exitCallbacks.get(phase)!.push(callback);
  }

  // ═══ Serialization ═══

  serialize(): PhaseState {
    const phaseStartedAt: Record<number, string> = {};
    for (const [p, ms] of Object.entries(this.phaseStartedAt)) {
      phaseStartedAt[Number(p)] = new Date(ms).toISOString();
    }

    return {
      currentPhase: this.currentPhase,
      state: this.state,
      phaseStartedAt,
      phaseCompletedAt: { ...this.phaseCompletedAt },
      abortReason: this.abortReason,
    };
  }

  static fromState(state: PhaseState, config: Record<number, PhaseConfig>): PhaseStateMachine {
    const sm = new PhaseStateMachine(config);
    sm.currentPhase = state.currentPhase;
    sm.state = state.state;
    sm.abortReason = state.abortReason;
    for (const [p, ts] of Object.entries(state.phaseStartedAt)) {
      sm.phaseStartedAt[Number(p)] = new Date(ts).getTime();
    }
    sm.phaseCompletedAt = { ...state.phaseCompletedAt };
    return sm;
  }

  // ═══ Internal ═══

  private fireCallbacks(callbacks?: PhaseCallback[]): void {
    if (!callbacks) return;
    for (const cb of callbacks) {
      try { cb(); } catch (err: any) {
        log.error({ err, phase: this.currentPhase }, 'Phase 回调失败');
      }
    }
  }
}
