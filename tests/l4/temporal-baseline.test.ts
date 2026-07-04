/**
 * tests/l4/temporal-baseline.test.ts
 */
import { describe, it, expect } from 'vitest';
import { computeTemporalBaseline } from '../../src/l4/temporal-baseline';

describe('computeTemporalBaseline', () => {
  describe('trend detection', () => {
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

    it('handles accelerating trend', () => {
      const r = computeTemporalBaseline([100, 105, 112, 121, 132, 145, 160, 177]);
      expect(r.trend).toBe('accelerating');
      expect(r.window_3m.slope).toBeGreaterThan(0);
    });

    it('detects reversing trend', () => {
      // 大幅下降后显著上升 = reversing
      const r = computeTemporalBaseline([200, 180, 160, 140, 120, 100, 130, 160]);
      expect(r.trend).toBe('reversing');
    });
  });

  describe('edge cases', () => {
    it('returns default for empty series', () => {
      const r = computeTemporalBaseline([]);
      expect(r.current).toBe(0);
      expect(r.trend).toBe('stable');
    });

    it('handles single-item series', () => {
      const r = computeTemporalBaseline([42]);
      expect(r.current).toBe(42);
    });

    it('handles two-item series', () => {
      const r = computeTemporalBaseline([10, 20]);
      expect(r.current).toBe(20);
    });
  });

  describe('seasonal component (gamma)', () => {
    it('handles seasonal data with quarterly pattern', () => {
      // 季度模式: 明显增长趋势, 最后3点加速度为正
      const quarterly = [
        100, 120, 110, 90,
        150, 170, 160, 140,
        200, 250, 280, 260,
      ];
      const r = computeTemporalBaseline(quarterly, 4, 0.3, 0.1, 0.1);
      // 启用 gamma 的季节性分量计算，应返回有效结果
      expect(r.current).toBe(260);
      expect(typeof r.window_12m.variance).toBe('number');
      expect(r.trend).toBe('decelerating'); // 季节尾端下降导致w3m斜率小于w12m
    });

    it('disables gamma when data is shorter than 2 periods', () => {
      const r = computeTemporalBaseline([100, 110, 120], 4, 0.3, 0.1, 0.1);
      expect(r.current).toBe(120);
      // Gamma 被禁用，但仍应返回有效结果
      expect(r.window_3m).toBeDefined();
    });
  });
});
