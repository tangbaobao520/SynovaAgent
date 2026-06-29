import { describe, it, expect } from 'vitest';
import { computeCustomerConcentration } from '../../../../extensions/sentinels/customer-demand-shift/computes/customer-concentration';

describe('computeCustomerConcentration', () => {
  it('空列表 degraded', () => {
    expect(computeCustomerConcentration([]).degraded).toBe(true);
  });

  it('单客户全集中', () => {
    const r = computeCustomerConcentration([
      { name: 'X', revenue: 100, status: 'active', churn: false },
    ]);
    expect(r.topCustomerShare).toBe(1);
    expect(r.degraded).toBe(false);
  });

  it('流失客户不计入', () => {
    const r = computeCustomerConcentration([
      { name: 'A', revenue: 100, status: 'active', churn: false },
      { name: 'B', revenue: 200, status: 'churned', churn: true },
    ]);
    expect(r.activeClientCount).toBe(1);
  });
});
