/**
 * tests/gns/state-machine-v2.test.ts — PhaseStateMachine maxPhases 动态化
 *
 * 铁律 0-2: 每个 public 函数 ≥ 2 用例 (happy + sad)
 */
import { describe, it, expect } from 'vitest';
import { PhaseStateMachine } from '../../src/orchestrator/phase-state-machine';

describe('PhaseStateMachine — maxPhases dynamic (GNS v2.0)', () => {
  it('Given legacy 6-phase config (0-5), When constructed, Then maxPhases=5', () => {
    const config = {
      0: { label: '访谈', required: true, maxDurationMs: 600_000 },
      1: { label: '采集', required: true, maxDurationMs: 120_000 },
      2: { label: '假设', required: true, maxDurationMs: 300_000 },
      3: { label: '根因', required: true, maxDurationMs: 180_000 },
      4: { label: '报告', required: true, maxDurationMs: 60_000 },
      5: { label: '交付', required: true, maxDurationMs: 120_000 },
    };
    const machine = new PhaseStateMachine(config);
    expect(machine.maxPhases).toBe(5);
  });

  it('Given GNS extended config (0-9), When constructed, Then maxPhases=9', () => {
    const config: Record<number, { label: string; required: boolean; maxDurationMs: number }> = {
      0: { label: '访谈', required: true, maxDurationMs: 600_000 },
      1: { label: '采集', required: true, maxDurationMs: 120_000 },
      2: { label: '假设', required: true, maxDurationMs: 300_000 },
      3: { label: '根因', required: true, maxDurationMs: 180_000 },
      4: { label: '报告', required: true, maxDurationMs: 60_000 },
      5: { label: '交付', required: true, maxDurationMs: 120_000 },
      6: { label: '监测', required: false, maxDurationMs: 86_400_000 },
      7: { label: '评估', required: false, maxDurationMs: 300_000 },
      8: { label: '提议', required: false, maxDurationMs: 120_000 },
      9: { label: '跟踪', required: false, maxDurationMs: 86_400_000 },
    };
    const machine = new PhaseStateMachine(config);
    expect(machine.maxPhases).toBe(9);
  });

  it('Given sparse config (only 0,3,5), When constructed, Then maxPhases=5 (min default)', () => {
    const config = {
      0: { label: '访谈', required: true, maxDurationMs: 600_000 },
      3: { label: '根因', required: true, maxDurationMs: 180_000 },
      5: { label: '交付', required: true, maxDurationMs: 120_000 },
    };
    const machine = new PhaseStateMachine(config);
    expect(machine.maxPhases).toBe(5); // Math.max(5,5) = 5
  });

  it('Given empty config, When constructed, Then maxPhases defaults to 5', () => {
    const machine = new PhaseStateMachine({});
    expect(machine.maxPhases).toBe(5);
  });
});

describe('PhaseStateMachine — legacy backward compat', () => {
  it('Given legacy 6-phase config, When advance through all, Then completes at phase 6', () => {
    const config = {
      0: { label: 'P0', required: true, maxDurationMs: 1000 },
      1: { label: 'P1', required: true, maxDurationMs: 1000 },
      2: { label: 'P2', required: true, maxDurationMs: 1000 },
      3: { label: 'P3', required: true, maxDurationMs: 1000 },
      4: { label: 'P4', required: true, maxDurationMs: 1000 },
      5: { label: 'P5', required: true, maxDurationMs: 1000 },
    };
    const machine = new PhaseStateMachine(config);
    // Advance 7 times: -1→0→1→2→3→4→5→completed(-1)
    const phases: number[] = [];
    for (let i = 0; i < 7; i++) {
      const result = machine.advance();
      phases.push(result.phase);
      if (result.phase === -1) break;
    }
    // Should reach phase 5 then complete
    expect(phases).toContain(5);
    expect(phases[phases.length - 1]).toBe(-1);
  });

  it('Given GNS config with phase 6-9, When advance past phase 5, Then continues to navigation phases', () => {
    const config: Record<number, { label: string; required: boolean; maxDurationMs: number }> = {};
    for (let i = 0; i <= 9; i++) {
      config[i] = { label: `P${i}`, required: true, maxDurationMs: 1000 };
    }
    const machine = new PhaseStateMachine(config);
    expect(machine.maxPhases).toBe(9);
    // Start at -1, advance through 0→9→completed(-1) = 11 calls
    let completed = false;
    for (let i = 0; i < 11; i++) {
      const result = machine.advance();
      if (result.phase === -1) { completed = true; break; }
    }
    expect(completed).toBe(true);
  });
});
