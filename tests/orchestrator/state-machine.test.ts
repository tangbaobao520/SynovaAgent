/**
 * orchestrator/state-machine.test.ts — Iter 2: PhaseStateMachine + Orchestrator 测试
 *
 * 对标 Claw-Code: Given/When/Then + 手写 fake
 * 铁律 0-2: 每个 public 函数 >= 2 用例
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { PhaseStateMachine } from '../../src/orchestrator/phase-state-machine';
import type { PhaseState, PhaseConfig } from '../../src/orchestrator/phase-state-machine';

function defaultConfig(): Record<number, PhaseConfig> {
  return {
    0: { label: '组织访谈', required: true, maxDurationMs: 600_000 },
    1: { label: '数据采集', required: true, maxDurationMs: 120_000 },
    2: { label: '假设生成', required: true, maxDurationMs: 300_000 },
    3: { label: '根因分析', required: true, maxDurationMs: 180_000 },
    4: { label: '报告生成', required: true, maxDurationMs: 60_000 },
    5: { label: '交付', required: true, maxDurationMs: 120_000 },
  };
}

describe('PhaseStateMachine', () => {
  let sm: PhaseStateMachine;

  beforeEach(() => {
    sm = new PhaseStateMachine(defaultConfig());
  });

  // ── Initial state ──

  it('Given new state machine, When inspected, Then phase is IDLE (-1)', () => {
    expect(sm.getCurrentPhase()).toBe(-1);
    expect(sm.getState()).toBe('idle');
  });

  // ── Phase progression ──

  it('Given IDLE, When advance called, Then enters Phase 0', () => {
    const result = sm.advance();
    expect(result.phase).toBe(0);
    expect(sm.getState()).toBe('running');
    expect(sm.getCurrentPhase()).toBe(0);
  });

  it('Given Phase 0 running, When advance called again, Then enters Phase 1', () => {
    sm.advance(); // 0
    const result = sm.advance(); // 1
    expect(result.phase).toBe(1);
  });

  it('Given all phases completed, When advance after Phase 5, Then state is completed', () => {
    // Advance through all 6 phases (IDLE(-1) → 0→1→2→3→4→5)
    for (let i = 0; i < 6; i++) sm.advance();
    expect(sm.getCurrentPhase()).toBe(5);
    expect(sm.getState()).toBe('running');
    // One more advance exits Phase 5 → completed
    sm.advance();
    expect(sm.getState()).toBe('completed');
    // Advancing past completion returns -1
    const result = sm.advance();
    expect(result.phase).toBe(-1);
  });

  // ── Phase lifecycle ──

  it('Given phase entered, When onEnter callback registered, Then callback invoked', () => {
    const entered: number[] = [];
    sm.onPhaseEnter(0, () => entered.push(0));
    sm.onPhaseEnter(1, () => entered.push(1));
    sm.advance(); // Phase 0
    expect(entered).toEqual([0]);
  });

  it('Given phase exited, When onExit callback registered, Then callback invoked on next advance', () => {
    const exited: number[] = [];
    sm.onPhaseExit(0, () => exited.push(0));
    sm.advance(); // Phase 0 enter
    sm.advance(); // Phase 0 exit → Phase 1 enter
    expect(exited).toEqual([0]);
  });

  // ── Phase skipping ──

  it('Given optional phase skipped, When skipTo called, Then transitions correctly', () => {
    // Make Phase 1 optional
    sm = new PhaseStateMachine({
      ...defaultConfig(),
      1: { ...defaultConfig()[1], required: false },
    });
    sm.advance(); // Phase 0
    const result = sm.skipTo(2); // Skip Phase 1
    expect(result.phase).toBe(2);
  });

  it('Given required phase, When skipTo called, Then throws error', () => {
    sm.advance(); // Phase 0
    expect(() => sm.skipTo(3)).toThrow('Cannot skip required phase 1');
  });

  // ── Timeouts ──

  it('Given phase with maxDurationMs, When elapsed time exceeds, Then isTimedOut returns true', () => {
    sm = new PhaseStateMachine({
      ...defaultConfig(),
      0: { ...defaultConfig()[0], maxDurationMs: 1 },
    });
    sm.advance(); // Phase 0 start
    // Wait 5ms to exceed 1ms timeout
    const start = Date.now();
    while (Date.now() - start < 5) { /* busy-wait */ }
    expect(sm.isCurrentPhaseTimedOut()).toBe(true);
  });

  // ── Serialization ──

  it('Given running state machine, When serialized then deserialized, Then state matches', () => {
    sm.advance(); // Phase 0
    sm.advance(); // Phase 1
    const state = sm.serialize();
    expect(state.currentPhase).toBe(1);
    expect(state.state).toBe('running');

    const restored = PhaseStateMachine.fromState(state, defaultConfig());
    expect(restored.getCurrentPhase()).toBe(1);
    expect(restored.getState()).toBe('running');
  });

  // ── Pause/Resume ──

  it('Given running phase, When pause then resume, Then continues from same phase', () => {
    sm.advance(); // Phase 0
    sm.pause();
    expect(sm.getState()).toBe('paused');
    sm.resume();
    expect(sm.getState()).toBe('running');
    expect(sm.getCurrentPhase()).toBe(0);
  });

  // ── Abort ──

  it('Given running phase, When abort called, Then state is aborted', () => {
    sm.advance(); // Phase 0
    sm.abort('user cancelled');
    expect(sm.getState()).toBe('aborted');
    expect(sm.getAbortReason()).toBe('user cancelled');
  });
});
