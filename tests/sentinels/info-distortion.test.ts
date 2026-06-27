import { describe, it, expect } from 'vitest';
import { computeInfoDistortion } from '../../extensions/sentinels/info-distortion/computes/compute-info-distortion';

describe('computeInfoDistortion', () => {
  it('空数据 degraded', () => {
    expect(computeInfoDistortion(0, 0, 0, 0).degraded).toBe(true);
  });

  it('扁平组织少故障 = 低失真', () => {
    const r = computeInfoDistortion(20, 2, 10, 0);
    expect(r.assessment).toBe('low');
    expect(r.degraded).toBe(false);
  });

  it('多层级多故障 = 高失真', () => {
    const r = computeInfoDistortion(10, 5, 20, 10);
    expect(r.assessment).toBe('high');
    expect(r.distortionRate).toBeGreaterThan(0.3);
  });

  it('中等 = moderate', () => {
    const r = computeInfoDistortion(15, 3, 10, 2);
    expect(r.assessment).toBe('moderate');
  });
});
