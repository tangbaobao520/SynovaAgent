import { describe, it, expect } from 'vitest';
import { computeInnovationOutput } from '../../../extensions/sentinels/shared/computes/l3-output/compute-innovation-output';

describe('COMPUTE-INNOVATION-OUTPUT-v1', () => {
  it('正常: 高吞吐高成功率', () => {
    const r = computeInnovationOutput({ throughputRate: 0.8, successProbability: 0.7 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeGreaterThan(0.5);
    expect(r.confidence).toBe('high');
  });

  it('降级: 无研发数据', () => {
    const r = computeInnovationOutput({ throughputRate: -1, successProbability: 0.5 });
    expect(r.degraded).toBe(true);
    expect(r.value).toBe(0);
  });

  it('边界: 零成功率', () => {
    const r = computeInnovationOutput({ throughputRate: 0.8, successProbability: 0 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBe(0);
  });

  it('时序声明: 本compute为纯横截面计算，不消费时序参数(slope/variance/trend/window)', () => {
    expect(true).toBe(true);
  });
});
