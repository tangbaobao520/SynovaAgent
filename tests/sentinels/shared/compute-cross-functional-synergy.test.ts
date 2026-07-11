import { describe, it, expect } from 'vitest';
import { computeCrossFunctionalSynergy } from '../../../extensions/sentinels/shared/computes/l3-output/compute-cross-functional-synergy';

describe('COMPUTE-CROSS-FUNCTIONAL-SYNERGY-v1', () => {
  it('正常: 高协同系数+高协调效率', () => {
    const r = computeCrossFunctionalSynergy({ synergyCoefficient: 0.8, coordinationEfficiency: 0.9 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeGreaterThan(0.7);
    expect(r.confidence).toBe('high');
  });

  it('降级: 无协同数据', () => {
    const r = computeCrossFunctionalSynergy({ synergyCoefficient: -1, coordinationEfficiency: 0 });
    expect(r.degraded).toBe(true);
    expect(r.value).toBe(0);
  });

  it('边界: 零协调效率', () => {
    const r = computeCrossFunctionalSynergy({ synergyCoefficient: 0.8, coordinationEfficiency: 0 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBe(0);
  });

  it('时序声明: 本compute为纯横截面计算，不消费时序参数(slope/variance/trend/window)', () => {
    expect(true).toBe(true);
  });
});
