import { describe, it, expect } from 'vitest';
import { computeLtvCac } from '../../extensions/sentinels/unit-economics/computes/ltv-cac-ratio';

describe('I10: computeLtvCac', () => {
  it('should return degraded for empty data', () => {
    const r = computeLtvCac([]);
    expect(r.degraded).toBe(true);
    expect(r.ltvCac).toBe(0);
  });

  it('should compute LTV/CAC > 3 for healthy unit economics', () => {
    const r = computeLtvCac([
      { customerLifetimeValue: 3000, customerAcquisitionCost: 500 },
      { customerLifetimeValue: 5000, customerAcquisitionCost: 1000 },
    ]);
    expect(r.degraded).toBe(false);
    expect(r.ltvCac).toBeGreaterThan(3);
    expect(r.ltv).toBe(8000);
  });

  it('should handle zero CAC gracefully', () => {
    const r = computeLtvCac([{ customerLifetimeValue: 1000, customerAcquisitionCost: 0 }]);
    expect(r.degraded).toBe(false);
    expect(r.ltvCac).toBe(99);
  });
});
