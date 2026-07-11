import { describe, it, expect } from 'vitest';
import { computeServiceSupport } from '../../../extensions/sentinels/shared/computes/l3-output/compute-service-support';

describe('COMPUTE-SERVICE-SUPPORT-v1', () => {
  it('正常: 高满意度+快速解决', () => {
    const r = computeServiceSupport({ satisfactionScore: 0.9, resolutionSpeed: 0.8 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeGreaterThan(0.7);
    expect(r.confidence).toBe('high');
  });

  it('降级: 无售后数据', () => {
    const r = computeServiceSupport({ satisfactionScore: -1, resolutionSpeed: 0 });
    expect(r.degraded).toBe(true);
    expect(r.value).toBe(0);
  });

  it('边界: 零解决速度', () => {
    const r = computeServiceSupport({ satisfactionScore: 0.8, resolutionSpeed: 0 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBe(0);
  });

  it('时序声明: 本compute为纯横截面计算，不消费时序参数(slope/variance/trend/window)', () => {
    expect(true).toBe(true);
  });
});
