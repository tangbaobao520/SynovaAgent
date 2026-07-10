import { describe, it, expect } from 'vitest';
import { computeReputationFlywheel } from '../../../extensions/sentinels/shared/computes/l5-reinput/compute-reputation-flywheel';

describe('COMPUTE-REPUTATION-FLYWHEEL-v1', () => {
  it('正常: 高声誉高推荐', () => {
    const r = computeReputationFlywheel({ reputationScore: 0.9, referralRate: 0.8 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeGreaterThan(0.7);
    expect(r.confidence).toBe('high');
  });

  it('降级: 无声誉数据', () => {
    const r = computeReputationFlywheel({ reputationScore: -1, referralRate: 0 });
    expect(r.degraded).toBe(true);
    expect(r.value).toBe(0);
  });

  it('边界: 零推荐率', () => {
    const r = computeReputationFlywheel({ reputationScore: 0.8, referralRate: 0 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBe(0);
  });
});
