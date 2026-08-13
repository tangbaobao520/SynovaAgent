import { describe, it, expect } from 'vitest';
import { computeQualityTraceability } from '../../../extensions/sentinels/shared/computes/l1-production/compute-quality-traceability';

describe('computeQualityTraceability', () => {
  it('normal: full traceability', () => {
    const r = computeQualityTraceability(1000, 1000, 0.02);
    expect(r.degraded).toBe(false);
    expect(r.traceabilityRate).toBe(1);
  });

  it('degraded: zero total units', () => {
    const r = computeQualityTraceability(0, 0, 0);
    expect(r.degraded).toBe(true);
  });

  it('boundary: high defect rate', () => {
    const r = computeQualityTraceability(500, 1000, 0.5);
    expect(r.degraded).toBe(false);
    expect(r.value).toBe(0.5);
  });
});
