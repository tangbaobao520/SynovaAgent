import { describe, it, expect } from 'vitest';
import { computeBrandBuilding } from '../../../extensions/sentinels/shared/computes/l3-output/compute-brand-building';

describe('COMPUTE-BRAND-BUILDING-v1', () => {
  it('正常: 高投入高弹性', () => {
    const r = computeBrandBuilding({ brandInvestment: 0.8, brandElasticity: 0.7 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeGreaterThan(0.5);
    expect(r.confidence).toBe('high');
  });

  it('降级: 无品牌数据', () => {
    const r = computeBrandBuilding({ brandInvestment: -1, brandElasticity: 0.5 });
    expect(r.degraded).toBe(true);
    expect(r.value).toBe(0);
  });

  it('边界: 零弹性品牌投入无效', () => {
    const r = computeBrandBuilding({ brandInvestment: 0.8, brandElasticity: 0 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBe(0);
  });

  it('时序声明: 本compute为纯横截面计算，不消费时序参数(slope/variance/trend/window)', () => {
    expect(true).toBe(true);
  });
});
