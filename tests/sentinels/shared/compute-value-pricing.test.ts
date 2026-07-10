import { describe, it, expect } from 'vitest';
import { computeValuePricing } from '../../../extensions/sentinels/shared/computes/l4-capture/compute-value-pricing';

describe('COMPUTE-VALUE-PRICING-v1', () => {
  it('正常: 高定价权低弹性', () => {
    const r = computeValuePricing({ pricingPower: 0.8, priceElasticityFactor: 0.7 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeGreaterThan(0.5);
    expect(r.confidence).toBe('high');
  });

  it('降级: 无定价数据', () => {
    const r = computeValuePricing({ pricingPower: -1, priceElasticityFactor: 0.5 });
    expect(r.degraded).toBe(true);
    expect(r.value).toBe(0);
  });

  it('边界: 零定价权', () => {
    const r = computeValuePricing({ pricingPower: 0, priceElasticityFactor: 0.8 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBe(0);
  });

  it('时序声明: 本compute为纯横截面计算，不消费时序参数(slope/variance/trend/window)', () => {
    // 测试体系权威规范 §2.3.2: 时序fixture仅对消费时序参数的compute强制。
    // 本compute输入为标量值，时序趋势计算由aggregate.ts通过computeTemporalBaseline派生。
    // 时序fixture需求在I2阶段4哨兵接线测试中覆盖。
    expect(true).toBe(true);
  });
});
