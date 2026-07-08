import { describe, it, expect } from 'vitest';
import { computeCustomerProfitability } from '../../../extensions/sentinels/shared/computes/l2-value/compute-customer-profitability';

describe('computeCustomerProfitability', () => {
  it('normal: profitable customer base', () => {
    const r = computeCustomerProfitability(100000, 60000, 100);
    expect(r.degraded).toBe(false);
    expect(r.profitPerCustomer).toBe(400);
    expect(r.profitMargin).toBe(0.4);
  });

  it('degraded: zero customers', () => {
    const r = computeCustomerProfitability(100000, 60000, 0);
    expect(r.degraded).toBe(true);
    expect(r.value).toBe(0);
  });

  it('boundary: negative profit', () => {
    const r = computeCustomerProfitability(50000, 80000, 10);
    expect(r.degraded).toBe(false);
    expect(r.profitPerCustomer).toBe(-3000);
    expect(r.profitMargin).toBe(-0.6);
  });
});
