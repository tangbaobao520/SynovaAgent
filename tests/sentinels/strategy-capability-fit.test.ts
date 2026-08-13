import { describe, it, expect } from 'vitest';
import { computeStrategyCapabilityFit } from '../../extensions/sentinels/strategy-capability-fit/computes/compute-strategy-capability-fit';

describe('S1: computeStrategyCapabilityFit', () => {
  it('should return degraded for empty inputs', () => {
    const r = computeStrategyCapabilityFit([], []);
    expect(r.degraded).toBe(true);
  });

  it('should compute high fit for aligned goals and capabilities', () => {
    const r = computeStrategyCapabilityFit(
      [{ name: 'expand-market', goalType: 'strategic' }, { name: 'innovate-product', goalType: 'innovation' }],
      [{ name: 'eng-team', category: 'core_competence', level: 4 }, { name: 'data-platform', category: 'core_competence', level: 3 }],
    );
    expect(r.degraded).toBe(false);
    expect(r.alignmentGaps).toHaveLength(0);
  });

  it('should identify gaps between strategic goals and capabilities', () => {
    const r = computeStrategyCapabilityFit(
      [{ name: 'expand-market', goalType: 'strategic' }, { name: 'innovate-product', goalType: 'innovation' }],
      [{ name: 'support-team', category: 'support', level: 2 }],
    );
    expect(r.degraded).toBe(false);
    expect(r.alignmentGaps.length).toBeGreaterThan(0);
  });
});
