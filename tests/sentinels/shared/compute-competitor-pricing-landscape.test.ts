import { describe, it, expect } from 'vitest';
import { computeCompetitorPricingLandscape } from '../../../extensions/sentinels/shared/computes/l4-competition/compute-competitor-pricing-landscape';

describe('computeCompetitorPricingLandscape', () => {
  it('normal: multiple competitors', () => {
    const r = computeCompetitorPricingLandscape([
      { name: 'A', price: 100 }, { name: 'B', price: 120 }, { name: 'C', price: 80 },
    ]);
    expect(r.degraded).toBe(false);
    expect(r.value.averagePrice).toBe(100);
  });

  it('degraded: empty competitors', () => {
    const r = computeCompetitorPricingLandscape([]);
    expect(r.degraded).toBe(true);
  });

  it('boundary: own price premium', () => {
    const r = computeCompetitorPricingLandscape([
      { name: 'A', price: 100 }, { name: 'B', price: 110 },
    ], 150);
    expect(r.degraded).toBe(false);
    expect(r.value.pricePosition).toBe('premium');
  });
});
