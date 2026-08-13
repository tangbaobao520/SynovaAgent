import { describe, it, expect } from 'vitest';
import { computeCustomerValueScore } from '../../../extensions/sentinels/shared/computes/l2-value/compute-customer-value-score';

describe('computeCustomerValueScore', () => {
  it('normal: high-value customer', () => {
    const r = computeCustomerValueScore({ revenue: 500000, tenureMonths: 36, churnRisk: 0.1, referralCount: 5 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeGreaterThan(50);
  });

  it('degraded: invalid input', () => {
    const r = computeCustomerValueScore({ revenue: -1, tenureMonths: 0, churnRisk: 0, referralCount: 0 });
    expect(r.degraded).toBe(true);
  });

  it('boundary: zero revenue', () => {
    const r = computeCustomerValueScore({ revenue: 0, tenureMonths: 12, churnRisk: 0.5, referralCount: 0 });
    expect(r.degraded).toBe(false);
    expect(r.components.revenueScore).toBe(0);
  });
});
