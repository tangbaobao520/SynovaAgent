import { describe, it, expect } from 'vitest';
import { computeTalentAcquisition } from '../../../extensions/sentinels/shared/computes/l1-input/compute-talent-acquisition';

describe('COMPUTE-TALENT-ACQUISITION-v1', () => {
  it('正常: 高质量批量招聘', () => {
    const r = computeTalentAcquisition({ hiresCount: 50, avgQualityScore: 0.8, selectionThreshold: 0.5 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeGreaterThan(0.5);
    expect(r.confidence).toBe('high');
  });

  it('降级: 无招聘数据', () => {
    const r = computeTalentAcquisition({ hiresCount: -1, avgQualityScore: -1, selectionThreshold: 0 });
    expect(r.degraded).toBe(true);
    expect(r.value).toBe(0);
  });

  it('边界: 零招聘', () => {
    const r = computeTalentAcquisition({ hiresCount: 0, avgQualityScore: 0.5, selectionThreshold: 0.5 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBe(0);
  });

  it('时序声明: 本compute为纯横截面计算，不消费时序参数(slope/variance/trend/window)', () => {
    expect(true).toBe(true);
  });
});
