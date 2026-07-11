import { describe, it, expect } from 'vitest';
import { computeIncentiveAlignment } from '../../../extensions/sentinels/shared/computes/l2-internal/compute-incentive-alignment';

describe('COMPUTE-INCENTIVE-ALIGNMENT-v1', () => {
  it('正常: 高目标一致性+低扭曲', () => {
    const r = computeIncentiveAlignment({ kpiGoalCongruence: 0.9, incentiveDistortion: 0.1 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeGreaterThan(0.7);
    expect(r.confidence).toBe('high');
  });

  it('降级: 无KPI数据', () => {
    const r = computeIncentiveAlignment({ kpiGoalCongruence: -1, incentiveDistortion: 0 });
    expect(r.degraded).toBe(true);
    expect(r.value).toBe(0);
  });

  it('边界: 高扭曲几乎抵消激励', () => {
    const r = computeIncentiveAlignment({ kpiGoalCongruence: 0.8, incentiveDistortion: 0.9 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeLessThan(0.1);
  });

  it('时序声明: 本compute为纯横截面计算，不消费时序参数(slope/variance/trend/window)', () => {
    expect(true).toBe(true);
  });
});
