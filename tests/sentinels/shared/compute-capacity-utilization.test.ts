import { describe, it, expect } from 'vitest';
import { computeCapacityUtilization } from '../../../extensions/sentinels/shared/computes/l1-production/compute-capacity-utilization';

describe('computeCapacityUtilization', () => {
  it('normal: 80% utilization', () => {
    const r = computeCapacityUtilization(800, 1000);
    expect(r.value).toBe(0.8);
    expect(r.status).toBe('normal');
    expect(r.degraded).toBe(false);
  });

  it('degraded: zero theoretical capacity', () => {
    const r = computeCapacityUtilization(100, 0);
    expect(r.degraded).toBe(true);
    expect(r.value).toBe(0);
  });

  it('boundary: over 100% (overload)', () => {
    const r = computeCapacityUtilization(1200, 1000);
    expect(r.value).toBe(1.2);
    expect(r.status).toBe('critical');
  });
});
