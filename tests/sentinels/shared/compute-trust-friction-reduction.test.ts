import { describe, it, expect } from 'vitest';
import { computeTrustFrictionReduction } from '../../../extensions/sentinels/shared/computes/l2-internal/compute-trust-friction-reduction';

describe('COMPUTE-TRUST-FRICTION-REDUCTION-v1', () => {
  it('正常: 高信任+高协作', () => {
    const r = computeTrustFrictionReduction({ trustLevel: 0.9, collaborationEfficiency: 0.8 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeGreaterThan(0.7);
    expect(r.confidence).toBe('high');
  });

  it('降级: 无信任数据', () => {
    const r = computeTrustFrictionReduction({ trustLevel: -1, collaborationEfficiency: 0.5 });
    expect(r.degraded).toBe(true);
    expect(r.value).toBe(0);
  });

  it('边界: 零信任', () => {
    const r = computeTrustFrictionReduction({ trustLevel: 0, collaborationEfficiency: 0.5 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBe(0);
  });
});
