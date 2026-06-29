import { describe, it, expect } from 'vitest';
import { computeTalentDensity } from '../../extensions/sentinels/talent-density/computes/compute-talent-density';

describe('O10: computeTalentDensity', () => {
  it('should return degraded for zero headcount', () => {
    const r = computeTalentDensity(0, 0);
    expect(r.degraded).toBe(true);
    expect(r.assessment).toBe('insufficient');
  });

  it('should compute high density for skilled teams', () => {
    const r = computeTalentDensity(100, 60);
    expect(r.degraded).toBe(false);
    expect(r.density).toBe(0.6);
    expect(r.assessment).toBe('high');
  });

  it('should compute low density for junior-heavy teams', () => {
    const r = computeTalentDensity(100, 10);
    expect(r.degraded).toBe(false);
    expect(r.density).toBeLessThan(0.5);
    expect(r.assessment).toBe('low');
  });
});
