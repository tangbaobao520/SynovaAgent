import { describe, it, expect } from 'vitest';
import { computeBreakEven } from '../../../extensions/sentinels/unit-economics/computes/break-even';

describe('computeBreakEven', () => {
  it('should compute correct break-even point', () => {
    const r = computeBreakEven(100000, 100, 40, 2000);
    expect(r.breakEvenUnits).toBeCloseTo(1666.67, 0);
    expect(r.contributionMargin).toBe(60);
    expect(r.degraded).toBe(false);
  });

  it('should detect profitability', () => {
    const r = computeBreakEven(100000, 100, 40, 2000);
    expect(r.isProfitable).toBe(true);
    expect(r.safetyMargin).toBeGreaterThan(0);
  });

  it('should degrade on non-positive margin', () => {
    const r = computeBreakEven(100000, 50, 50, 1000);
    expect(r.degraded).toBe(true);
  });
});
