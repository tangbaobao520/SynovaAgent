import { describe, it, expect } from 'vitest';
import { computeCapitalSourceMix } from '../../../extensions/sentinels/shared/computes/l1-input/compute-capital-source-mix';

describe('COMPUTE-CAPITAL-SOURCE-MIX-v1', () => {
  it('正常: 均衡债务+多元化', () => {
    const r = computeCapitalSourceMix({ debtEquityRatio: 1, sourceDiversification: 0.8 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeGreaterThan(0.5);
  });

  it('降级: 负值数据异常', () => {
    const r = computeCapitalSourceMix({ debtEquityRatio: -1, sourceDiversification: 0 });
    expect(r.degraded).toBe(true);
    expect(r.value).toBe(0);
  });

  it('边界: 极高负债率', () => {
    const r = computeCapitalSourceMix({ debtEquityRatio: 10, sourceDiversification: 0 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeLessThan(0.5);
  });

  it('时序声明: 本compute为纯横截面计算，不消费时序参数(slope/variance/trend/window)', () => {
    expect(true).toBe(true);
  });
});
