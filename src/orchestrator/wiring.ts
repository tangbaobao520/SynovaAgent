/**
 * orchestrator/wiring.ts — 编排层接线 (Phase: 接线)
 *
 * 将编排层组件接入现有 ConversationEngine:
 *   1. EventBus — 关键生命周期事件追踪
 *   2. HookRunner — 工具执行 pre/post hooks
 *   3. SessionManager — 自动压缩
 *   4. PhaseStateMachine — 替换简单轮次计数
 *
 * 最小侵入: 不改 ConversationEngine 内部逻辑，
 * 通过包装/装饰器模式在现有调用链上挂接编排组件。
 */
import { EventBus } from './event-bus';
import { HookRunner } from './hook-runner';
import { SessionManager } from './session-manager';
import { PhaseStateMachine } from './phase-state-machine';
import type { LLMClient } from './diagnosis-orchestrator';
import type { LLMProvider } from '../providers/types';
import { createLogger } from '../logger';

const log = createLogger('orchestrator/wiring');

// ═══ Types ═══

export interface OrchestrationWiring {
  eventBus: EventBus;
  hookRunner: HookRunner;
  sessionManager: SessionManager;
  stateMachine: PhaseStateMachine;
  /** Emit a phase.started event */
  emitPhaseStarted(consultationId: string, phase: number, traceId: string): void;
  /** Emit a phase.completed event */
  emitPhaseCompleted(consultationId: string, phase: number, traceId: string): void;
  /** Emit a tool execution event (pre + post + result) */
  emitToolExecuted(consultationId: string, toolName: string, success: boolean, traceId: string): void;
  /** Check if session needs compaction and compact if needed */
  checkCompaction(): string | null;
  /** Advance to next phase */
  advancePhase(consultationId: string, traceId: string): { phase: number; label: string } | null;
}

// ═══ Default Wiring ═══

const DEFAULT_PHASE_CONFIGS = {
  0: { label: '组织访谈', required: true, maxDurationMs: 600_000 },
  1: { label: '数据采集', required: true, maxDurationMs: 120_000 },
  2: { label: '假设生成', required: true, maxDurationMs: 300_000 },
  3: { label: '根因分析', required: true, maxDurationMs: 180_000 },
  4: { label: '报告生成', required: true, maxDurationMs: 60_000 },
  5: { label: '交付', required: true, maxDurationMs: 120_000 },
};

/**
 * Create the orchestration wiring.
 * Call once at app startup.
 */
export function createOrchestrationWiring(
  eventBus: EventBus,
  hookRunner: HookRunner,
  sessionManager: SessionManager,
  stateMachine: PhaseStateMachine,
): OrchestrationWiring {
  return {
    eventBus,
    hookRunner,
    sessionManager,
    stateMachine,

    emitPhaseStarted(cid: string, phase: number, traceId: string) {
      eventBus.emit({
        id: `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'phase.started',
        consultationId: cid, phase,
        data: { label: DEFAULT_PHASE_CONFIGS[phase]?.label || `Phase ${phase}` },
        traceId, spanId: traceId.slice(0, 16),
        timestamp: new Date().toISOString(),
      });
    },

    emitPhaseCompleted(cid: string, phase: number, traceId: string) {
      eventBus.emit({
        id: `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'phase.completed',
        consultationId: cid, phase,
        data: {},
        traceId, spanId: traceId.slice(0, 16),
        timestamp: new Date().toISOString(),
      });
    },

    emitToolExecuted(cid: string, toolName: string, success: boolean, traceId: string) {
      eventBus.emit({
        id: `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        type: success ? 'tool.executed' : 'tool.failed',
        consultationId: cid,
        data: { toolName, success },
        traceId, spanId: traceId.slice(0, 16),
        timestamp: new Date().toISOString(),
      });
    },

    checkCompaction(): string | null {
      if (sessionManager.needsCompaction()) {
        const result = sessionManager.compact();
        log.info({ removed: result.removedCount }, '会话自动压缩');
        return result.summary;
      }
      return null;
    },

    advancePhase(cid: string, traceId: string) {
      const result = stateMachine.advance();
      if (result.phase >= 0) {
        this.emitPhaseStarted(cid, result.phase, traceId);
      }
      return result.phase >= 0 ? result : null;
    },
  };
}
