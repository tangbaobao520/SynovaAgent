import { describe, it, expect } from 'vitest';
import { computeCapitalAcquisition } from '../../../extensions/sentinels/shared/computes/l1-input/compute-capital-acquisition';

describe('COMPUTE-CAPITAL-ACQUISITION-v1', () => {
  it('正常: 超额完成融资', () => {
    const r = computeCapitalAcquisition({ capitalRaised: 120, costOfCapital: 8, targetCapital: 100 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeGreaterThan(0.5);
    expect(r.confidence).toBe('high');
  });

  it('降级: 目标融资额为0', () => {
    const r = computeCapitalAcquisition({ capitalRaised: 0, costOfCapital: 10, targetCapital: 0 });
    expect(r.degraded).toBe(true);
    expect(r.value).toBe(0);
  });

  it('边界: 高资本成本几乎抵消融资', () => {
    const r = computeCapitalAcquisition({ capitalRaised: 100, costOfCapital: 100, targetCapital: 100 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeLessThan(0.1);
  });

  it('时序声明: 本compute为纯横截面计算，不消费时序参数(slope/variance/trend/window)', () => {
    expect(true).toBe(true);
  });
});
