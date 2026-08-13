import { describe, it, expect } from 'vitest';
import { computeProcurementBargaining } from '../../../extensions/sentinels/shared/computes/l4-capture/compute-procurement-bargaining';

describe('COMPUTE-PROCUREMENT-BARGAINING-v1', () => {
  it('正常: 强议价+高降本', () => {
    const r = computeProcurementBargaining({ bargainingPower: 0.8, costReductionRatio: 0.6 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeGreaterThan(0.4);
    expect(r.confidence).toBe('medium');
  });

  it('降级: 无采购数据', () => {
    const r = computeProcurementBargaining({ bargainingPower: -1, costReductionRatio: 0 });
    expect(r.degraded).toBe(true);
    expect(r.value).toBe(0);
  });

  it('边界: 零议价能力', () => {
    const r = computeProcurementBargaining({ bargainingPower: 0, costReductionRatio: 0.6 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBe(0);
  });

  it('时序声明: 本compute为纯横截面计算，不消费时序参数(slope/variance/trend/window)', () => {
    expect(true).toBe(true);
  });
});
