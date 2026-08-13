import { describe, it, expect } from 'vitest';
import { computeProcessCapability } from '../../../extensions/sentinels/shared/computes/l1-production/compute-process-capability';

describe('computeProcessCapability', () => {
  it('normal: capable process', () => {
    const r = computeProcessCapability([10.1, 9.9, 10.0, 10.2, 9.8], 11, 9);
    expect(r.degraded).toBe(false);
    expect(r.capability).toBe('excellent');
  });

  it('degraded: insufficient samples', () => {
    const r = computeProcessCapability([10], 11, 9);
    expect(r.degraded).toBe(true);
  });

  it('boundary: poor capability', () => {
    const r = computeProcessCapability([8, 12, 7, 13, 6], 11, 9);
    expect(r.degraded).toBe(false);
    expect(r.capability).toBe('poor');
  });
});
