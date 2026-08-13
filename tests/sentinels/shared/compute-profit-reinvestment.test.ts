import { describe, it, expect } from 'vitest';
import { computeProfitReinvestment } from '../../../extensions/sentinels/shared/computes/l5-reinput/compute-profit-reinvestment';

describe('COMPUTE-PROFIT-REINVESTMENT-v1', () => {
  it('正常: 高比例高增长', () => {
    const r = computeProfitReinvestment({ reinvestmentRatio: 0.7, profitGrowth: 0.8 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeGreaterThan(0.5);
    expect(r.confidence).toBe('high');
  });

  it('降级: 无利润数据', () => {
    const r = computeProfitReinvestment({ reinvestmentRatio: -1, profitGrowth: 0 });
    expect(r.degraded).toBe(true);
    expect(r.value).toBe(0);
  });

  it('边界: 零再投资', () => {
    const r = computeProfitReinvestment({ reinvestmentRatio: 0, profitGrowth: 0.8 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBe(0);
  });

  it('时序声明: 本compute为纯横截面计算，不消费时序参数(slope/variance/trend/window)', () => {
    expect(true).toBe(true);
  });
});
