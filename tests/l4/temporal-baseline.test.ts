/**
 * tests/l4/temporal-baseline.test.ts
 */
import { describe, it, expect } from 'vitest';
import { computeTemporalBaseline } from '../../src/l4/temporal-baseline';

describe('computeTemporalBaseline', () => {
  it('detects decelerating trend with steep decline', () => {
    const r = computeTemporalBaseline([100, 98, 95, 91, 86, 80, 73, 65]);
    expect(r.trend).toBe('decelerating');
    expect(r.window_3m.slope).toBeLessThan(0);
  });

  it('handles stable series', () => {
    const r = computeTemporalBaseline([100, 101, 99, 102, 100, 101, 100, 99]);
    expect(r.trend).toBe('stable');
    expect(r.window_12m.variance).toBeLessThanOrEqual(5);
  });

  it('returns default for empty series', () => {
    const r = computeTemporalBaseline([]);
    expect(r.current).toBe(0);
    expect(r.trend).toBe('stable');
  });

  it('handles accelerating trend', () => {
    const r = computeTemporalBaseline([100, 105, 112, 121, 132, 145, 160, 177]);
    expect(r.trend).toBe('accelerating');
    expect(r.window_3m.slope).toBeGreaterThan(0);
  });
});
