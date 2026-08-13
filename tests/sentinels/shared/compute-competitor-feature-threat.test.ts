import { describe, it, expect } from 'vitest';
import { computeCompetitorFeatureThreat } from '../../../extensions/sentinels/shared/computes/l4-competition/compute-competitor-feature-threat';

describe('computeCompetitorFeatureThreat', () => {
  it('normal: moderate threat', () => {
    const r = computeCompetitorFeatureThreat(10, 8, 0.5, 0.3);
    expect(r.degraded).toBe(false);
    expect(r.threatLevel).toBe('moderate');
  });

  it('degraded: negative values', () => {
    const r = computeCompetitorFeatureThreat(-1, 0, 0, 0);
    expect(r.degraded).toBe(true);
  });

  it('boundary: severe threat', () => {
    const r = computeCompetitorFeatureThreat(5, 20, 0.9, 0.8);
    expect(r.degraded).toBe(false);
    expect(r.threatLevel).toBe('severe');
  });
});
