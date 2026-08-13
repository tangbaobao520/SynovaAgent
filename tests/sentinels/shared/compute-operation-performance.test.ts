import { describe, it, expect } from 'vitest';
import { computeOperationPerformance } from '../../../extensions/sentinels/shared/computes/l1-production/compute-operation-performance';

describe('computeOperationPerformance', () => {
  it('normal: all metrics on target', () => {
    const r = computeOperationPerformance([
      { name: 'efficiency', actual: 100, target: 100, weight: 1 },
    ]);
    expect(r.degraded).toBe(false);
    expect(r.value).toBe(1);
  });

  it('degraded: empty metrics', () => {
    const r = computeOperationPerformance([]);
    expect(r.degraded).toBe(true);
    expect(r.value).toBe(0);
  });

  it('boundary: partial performance', () => {
    const r = computeOperationPerformance([
      { name: 'speed', actual: 50, target: 100, weight: 1 },
    ]);
    expect(r.degraded).toBe(false);
    expect(r.value).toBe(0.5);
  });
});
