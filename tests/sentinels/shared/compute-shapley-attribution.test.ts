import { describe, it, expect } from 'vitest';
import { computeShapleyAttribution } from '../../../extensions/sentinels/shared/computes/l3-causal/compute-shapley-attribution';

describe('computeShapleyAttribution', () => {
  it('normal: 3 factors with different contributions', () => {
    const r = computeShapleyAttribution([
      { name: 'marketing', marginalContribution: 50 },
      { name: 'sales', marginalContribution: 30 },
      { name: 'product', marginalContribution: 20 },
    ]);
    expect(r.degraded).toBe(false);
    expect(r.attributions).toHaveLength(3);
    expect(r.attributions[0].factor).toBe('marketing');
    expect(r.attributions[0].weight).toBe(0.5);
  });

  it('degraded: empty factors', () => {
    const r = computeShapleyAttribution([]);
    expect(r.degraded).toBe(true);
    expect(r.attributions).toHaveLength(0);
  });

  it('boundary: single factor gets weight 1.0', () => {
    const r = computeShapleyAttribution([{ name: 'only', marginalContribution: 100 }]);
    expect(r.degraded).toBe(false);
    expect(r.attributions[0].weight).toBe(1);
  });
});
