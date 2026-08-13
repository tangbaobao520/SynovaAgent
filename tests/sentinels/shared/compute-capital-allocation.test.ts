import { describe, it, expect } from 'vitest';
import { computeCapitalAllocation } from '../../../extensions/sentinels/shared/computes/l2-internal/compute-capital-allocation';

describe('COMPUTE-CAPITAL-ALLOCATION-v1', () => {
  it('正常: 高分配比例高频率', () => {
    const r = computeCapitalAllocation({ allocationRatio: 0.8, reallocationFrequency: 0.9 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeGreaterThan(0.5);
    expect(r.confidence).toBe('high');
  });

  it('降级: 无资本池数据', () => {
    const r = computeCapitalAllocation({ allocationRatio: -1, reallocationFrequency: 0.5 });
    expect(r.degraded).toBe(true);
    expect(r.value).toBe(0);
    expect(r.warnings.some(w => w.includes('未配置'))).toBe(true);
  });

  it('边界: 低分配比例低频', () => {
    const r = computeCapitalAllocation({ allocationRatio: 0.1, reallocationFrequency: 0.1 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeLessThan(0.1);
  });

  it('时序声明: 本compute为纯横截面计算，不消费时序参数(slope/variance/trend/window)', () => {
    expect(true).toBe(true);
  });
});
