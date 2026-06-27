import { describe, it, expect } from 'vitest';
import { computeResourceMisallocation } from '../../extensions/sentinels/resource-misallocation/computes/compute-resource-misallocation';

describe('computeResourceMisallocation', () => {
  it('空数据 degraded', () => {
    const r = computeResourceMisallocation([], []);
    expect(r.degraded).toBe(true);
  });

  it('高优目标缺资源应报告错配', () => {
    const r = computeResourceMisallocation(
      [{ name: '市场扩张', priority: 5, area: 'marketing' }],
      [{ goalArea: 'engineering', headcount: 20, budget: 1000 }]
    );
    expect(r.underfundedGoals.length).toBeGreaterThan(0);
    expect(r.index).toBeGreaterThan(0);
  });

  it('目标-资源匹配得低指数', () => {
    const r = computeResourceMisallocation(
      [{ name: '产品创新', priority: 5, area: 'product' }],
      [{ goalArea: 'product', headcount: 15, budget: 500 }]
    );
    expect(r.index).toBeLessThan(0.4);
  });

  it('大量无目标对应资源应报告过剩', () => {
    const r = computeResourceMisallocation(
      [{ name: '增长', priority: 3, area: 'growth' }],
      [{ goalArea: 'legacy', headcount: 50, budget: 2000 }]
    );
    expect(r.overstaffedAreas.length).toBeGreaterThan(0);
  });
});
