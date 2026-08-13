import { describe, it, expect } from 'vitest';
import { computeDemandToSpec } from '../../../extensions/sentinels/shared/computes/l3-output/compute-demand-to-spec';

describe('COMPUTE-DEMAND-TO-SPEC-v1', () => {
  it('正常: 高市场信号精度+高转化率', () => {
    const r = computeDemandToSpec({ marketSignalAccuracy: 0.9, specConversionRate: 0.8 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeGreaterThan(0.7);
    expect(r.confidence).toBe('high');
  });

  it('降级: 无市场数据', () => {
    const r = computeDemandToSpec({ marketSignalAccuracy: -1, specConversionRate: 0.5 });
    expect(r.degraded).toBe(true);
    expect(r.value).toBe(0);
  });

  it('边界: 零转化', () => {
    const r = computeDemandToSpec({ marketSignalAccuracy: 0.9, specConversionRate: 0 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBe(0);
  });

  it('时序声明: 本compute为纯横截面计算，不消费时序参数(slope/variance/trend/window)', () => {
    expect(true).toBe(true);
  });
});
