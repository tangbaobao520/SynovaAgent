import { describe, it, expect } from 'vitest';
import { computeCustomerConcentration } from '../../extensions/sentinels/customer-demand-shift/computes/customer-concentration';
import { computeCustomerChurnRisk } from '../../extensions/sentinels/customer-demand-shift/computes/customer-churn-risk';

describe('computeCustomerConcentration', () => {
  it('空列表 degraded', () => {
    expect(computeCustomerConcentration([]).degraded).toBe(true);
  });

  it('活跃客户集中度计算', () => {
    const r = computeCustomerConcentration([
      { name: 'A', revenue: 100, status: 'active', churn: false },
      { name: 'B', revenue: 50, status: 'active', churn: false },
    ]);
    expect(r.topCustomerName).toBe('A');
    expect(r.topCustomerShare).toBeCloseTo(100 / 150, 2);
    expect(r.degraded).toBe(false);
  });

  it('已流失客户不计入', () => {
    const r = computeCustomerConcentration([
      { name: 'A', revenue: 100, status: 'active', churn: false },
      { name: 'B', revenue: 50, status: 'churned', churn: true },
    ]);
    expect(r.activeClientCount).toBe(1);
  });
});

describe('computeCustomerChurnRisk', () => {
  it('空列表 degraded', () => {
    expect(computeCustomerChurnRisk([]).degraded).toBe(true);
  });

  it('无流失零风险', () => {
    const r = computeCustomerChurnRisk([
      { name: 'A', revenue: 100, churn: false },
      { name: 'B', revenue: 50, churn: false },
    ]);
    expect(r.churnRate).toBe(0);
  });

  it('流失率计算', () => {
    const r = computeCustomerChurnRisk([
      { name: 'A', revenue: 100, churn: false },
      { name: 'B', revenue: 50, churn: true },
    ]);
    expect(r.churnRate).toBeCloseTo(0.5, 2);
    expect(r.revenueChurnRate).toBeGreaterThan(0);
  });

  it('高价值低NPS标记', () => {
    const r = computeCustomerChurnRisk([
      { name: 'BigCo', revenue: 1000, churn: false, nps: 20 },
      { name: 'SmallCo', revenue: 10, churn: false, nps: 20 },
    ]);
    expect(r.highValueAtRisk.length).toBe(1);
    expect(r.highValueAtRisk[0]).toBe('BigCo');
  });
});
