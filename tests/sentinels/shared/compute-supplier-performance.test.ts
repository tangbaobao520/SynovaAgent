import { describe, it, expect } from 'vitest';
import { computeSupplierPerformance } from '../../../extensions/sentinels/shared/computes/l1-production/compute-supplier-performance';

describe('computeSupplierPerformance', () => {
  it('normal: A-tier supplier', () => {
    const r = computeSupplierPerformance(0.95, 0.98, 0.8);
    expect(r.degraded).toBe(false);
    expect(r.tier).toBe('A');
  });

  it('degraded: negative values', () => {
    const r = computeSupplierPerformance(-1, 0, 0);
    expect(r.degraded).toBe(true);
  });

  it('boundary: zero performance', () => {
    const r = computeSupplierPerformance(0, 0, 0);
    expect(r.degraded).toBe(true);
    expect(r.tier).toBe('C');
  });
});
