/**
 * tests/compute/compute-price-elasticity.test.ts — D61 价格弹性测试
 */
import { describe, it, expect } from 'vitest';

describe('computePriceElasticity', () => {
  it('正常路径: 弹性系数计算正确', async () => {
    const { computePriceElasticity } = await import('../../extensions/sentinels/shared/computes/l2-value/compute-price-elasticity');
    const result = computePriceElasticity(100, 1000, [
      { price: 100, quantity: 1000 },
      { price: 120, quantity: 800 },
      { price: 90, quantity: 1200 },
      { price: 110, quantity: 900 },
    ]);
    expect(result.degraded).toBe(false);
    expect(result.elasticity).toBeGreaterThan(0);
    expect(result.r_squared).toBeGreaterThan(0);
    expect(result.confidence_interval).toHaveLength(2);
    expect(result.economicInterpretation.elasticityType).toBeTruthy();
  });

  it('降级: 价格或数量为0 → degraded', async () => {
    const { computePriceElasticity } = await import('../../extensions/sentinels/shared/computes/l2-value/compute-price-elasticity');
    const result = computePriceElasticity(0, 1000, []);
    expect(result.degraded).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('边界: 仅1组历史数据 → degraded但有估算', async () => {
    const { computePriceElasticity } = await import('../../extensions/sentinels/shared/computes/l2-value/compute-price-elasticity');
    const result = computePriceElasticity(100, 1000, [{ price: 100, quantity: 1000 }]);
    expect(result.degraded).toBe(true);
    expect(result.r_squared).toBe(1);
    expect(result.elasticity).toBe(0);
  });
});
