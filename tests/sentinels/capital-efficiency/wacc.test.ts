import { describe, it, expect } from 'vitest';
import { computeWacc } from '../../../extensions/sentinels/capital-efficiency/computes/wacc';

describe('computeWacc', () => {
  it('should compute WACC for standard inputs', () => {
    const r = computeWacc([{ equity: 5000000, totalDebt: 3000000, taxRate: 0.25 }]);
    expect(r.wacc).toBeGreaterThan(0);
    expect(r.wacc).toBeLessThan(1);
    expect(r.degraded).toBe(false);
  });

  it('should degrade on empty data', () => {
    const r = computeWacc([]);
    expect(r.degraded).toBe(true);
  });

  it('should apply custom params', () => {
    const r = computeWacc([{ equity: 10000000, totalDebt: 0, taxRate: 0.25 }], { riskFree: 0.05, marketReturn: 0.12, beta: 1.2 });
    expect(r.debtWeight).toBe(0);
    expect(r.wacc).toBeGreaterThan(0);
  });
});
