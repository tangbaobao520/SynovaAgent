import { describe, it, expect } from 'vitest';
import { computeMaterialAvailability } from '../../../extensions/sentinels/shared/computes/l1-production/compute-material-availability';

describe('computeMaterialAvailability', () => {
  it('normal: sufficient stock', () => {
    const r = computeMaterialAvailability(200, 100, 7);
    expect(r.degraded).toBe(false);
    expect(r.stockStatus).toBe('sufficient');
  });

  it('degraded: zero required', () => {
    const r = computeMaterialAvailability(100, 0, 0);
    expect(r.degraded).toBe(true);
    expect(r.value).toBe(1);
  });

  it('boundary: critical stock', () => {
    const r = computeMaterialAvailability(30, 100, 45);
    expect(r.degraded).toBe(false);
    expect(r.stockStatus).toBe('critical');
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});
