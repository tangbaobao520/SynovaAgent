/**
 * tests/l4/temporal-baseline.test.ts — 时序基线单元测试
 *
 * 验证 Holt-Winters 指数平滑算法的趋势识别能力。
 */
import { describe, it, expect } from 'vitest';
import { computeTemporalBaseline } from '../../src/l4/temporal-baseline';

describe('computeTemporalBaseline', () => {
  it('detects decelerating trend from declining series', () => {
    const series = [100, 98, 95, 91, 86, 80, 73, 65];
    const params = computeTemporalBaseline(series);
    expect(params.trend).toBe('decelerating');
    expect(params.window_3m.slope).toBeLessThan(0);
  });

  it('handles stable series with low variance', () => {
    const series = [100, 101, 99, 102, 100, 101, 100, 99];
    const params = computeTemporalBaseline(series);
    expect(params.trend).toBe('stable');
    expect(params.window_12m.variance).toBeLessThan(5);
  });

  it('detects accelerating trend from rising series', () => {
    const series = [50, 55, 61, 68, 76, 85, 95, 106];
    const params = computeTemporalBaseline(series);
    expect(params.trend).toBe('accelerating');
    expect(params.window_3m.slope).toBeGreaterThan(0);
  });

  it('returns current as the last value', () => {
    const series = [10, 20, 30, 40, 50];
    const params = computeTemporalBaseline(series);
    expect(params.current).toBe(50);
  });

  it('returns proper structure for short series (3 values)', () => {
    const series = [100, 90, 80];
    const params = computeTemporalBaseline(series);
    expect(params.current).toBe(80);
    expect(params.trend).toBe('decelerating');
    expect(params.window_3m.mean).toBeGreaterThan(0);
    expect(params.window_12m.mean).toBeGreaterThan(0);
  });

  it('handles single-element series gracefully', () => {
    const series = [42];
    const params = computeTemporalBaseline(series);
    expect(params.current).toBe(42);
    expect(params.trend).toBe('stable');
  });
});
