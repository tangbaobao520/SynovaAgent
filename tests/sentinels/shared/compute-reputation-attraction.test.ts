import { describe, it, expect } from 'vitest';
import { computeReputationAttraction } from '../../../extensions/sentinels/shared/computes/l1-input/compute-reputation-attraction';

describe('COMPUTE-REPUTATION-ATTRACTION-v1', () => {
  it('正常: 强声誉高吸引', () => {
    const r = computeReputationAttraction({ reputationScore: 0.9, attractionMultiplier: 1.5 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeGreaterThan(0.5);
    expect(r.confidence).toBe('high');
  });

  it('降级: 无声誉数据', () => {
    const r = computeReputationAttraction({ reputationScore: -1, attractionMultiplier: 0 });
    expect(r.degraded).toBe(true);
    expect(r.value).toBe(0);
  });

  it('边界: 低声誉零吸引', () => {
    const r = computeReputationAttraction({ reputationScore: 0, attractionMultiplier: 0 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBe(0);
  });
});
