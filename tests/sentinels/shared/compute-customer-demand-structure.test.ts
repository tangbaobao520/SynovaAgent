import { describe, it, expect } from 'vitest';
import { computeCustomerDemandStructure } from '../../../extensions/sentinels/shared/computes/l2-value/compute-customer-demand-structure';

describe('computeCustomerDemandStructure', () => {
  it('normal: diversified demand', () => {
    const r = computeCustomerDemandStructure(
      Array.from({ length: 20 }, (_, i) => ({ name: `Cat${i}`, demandShare: 5 }))
    );
    expect(r.degraded).toBe(false);
    expect(r.concentration).toBe('diversified');
  });

  it('degraded: empty categories', () => {
    const r = computeCustomerDemandStructure([]);
    expect(r.degraded).toBe(true);
  });

  it('boundary: single category dominant', () => {
    const r = computeCustomerDemandStructure([
      { name: 'A', demandShare: 90 }, { name: 'B', demandShare: 10 },
    ]);
    expect(r.degraded).toBe(false);
    expect(r.concentration).toBe('highly_concentrated');
  });
});
