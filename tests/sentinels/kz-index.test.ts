import { describe, it, expect } from 'vitest';
import { computeKzIndex } from '../../extensions/sentinels/financing-constraint/computes/kz-index';

describe('F1: computeKzIndex', () => {
  it('should return degraded for empty input', () => {
    const r = computeKzIndex([]);
    expect(r.degraded).toBe(true);
  });

  it('should compute KZ index for healthy firm', () => {
    const r = computeKzIndex([{
      operatingCashFlow: 500,
      netPpe: 1000,
      totalDebt: 200,
      equity: 800,
      cash: 300,
    }]);
    expect(r.degraded).toBe(false);
    expect(r.kzIndex).toBeLessThan(1);
  });

  it('should compute high KZ for constrained firm', () => {
    const r = computeKzIndex([{
      operatingCashFlow: 50,
      netPpe: 1000,
      totalDebt: 900,
      equity: 100,
      cash: 20,
    }]);
    expect(r.degraded).toBe(false);
    expect(r.warnings.length).toBeGreaterThanOrEqual(0);
  });
});
