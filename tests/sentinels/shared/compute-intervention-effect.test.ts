import { describe, it, expect } from 'vitest';
import { computeInterventionEffect } from '../../../extensions/sentinels/shared/computes/l3-causal/compute-intervention-effect';

describe('computeInterventionEffect', () => {
  it('normal: positive intervention effect', () => {
    const r = computeInterventionEffect([10, 12, 11, 9, 10], [15, 18, 17, 16, 19]);
    expect(r.degraded).toBe(false);
    expect(r.cohensD).toBeGreaterThan(0);
    expect(r.effectSize).toBe('large');
  });

  it('degraded: insufficient pre-sample', () => {
    const r = computeInterventionEffect([10], [15, 18, 17]);
    expect(r.degraded).toBe(true);
  });

  it('boundary: no effect', () => {
    const r = computeInterventionEffect([10, 11, 10, 11], [10, 11, 10, 11]);
    expect(r.degraded).toBe(false);
    expect(r.effectSize).toBe('negligible');
  });
});
