import { describe, it, expect } from 'vitest';
import { computeCustomerChurnRisk } from '../../../../extensions/sentinels/customer-demand-shift/computes/customer-churn-risk';

describe('computeCustomerChurnRisk', () => {
  it('空列表 degraded', () => {
    expect(computeCustomerChurnRisk([]).degraded).toBe(true);
  });

  it('无流失零风险', () => {
    const r = computeCustomerChurnRisk([
      { name: 'A', revenue: 100, churn: false },
    ]);
    expect(r.churnRate).toBe(0);
  });

  it('高价值低NPS检测', () => {
    const r = computeCustomerChurnRisk([
      { name: 'Big', revenue: 1000, churn: false, nps: 20 },
    ]);
    expect(r.highValueAtRisk.length).toBe(1);
  });
});
