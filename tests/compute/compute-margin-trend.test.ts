/**
 * tests/compute/compute-margin-trend.test.ts — D61 利润率趋势测试
 */
import { describe, it, expect } from 'vitest';

describe('computeMarginTrend', () => {
  it('正常路径: 利润率趋势分解', async () => {
    const { computeMarginTrend } = await import('../../extensions/sentinels/shared/computes/l2-value/compute-margin-trend');
    const result = computeMarginTrend(1000, 700, [
      { revenue: 800, cost: 600, period: 'Q1' },
      { revenue: 900, cost: 650, period: 'Q2' },
      { revenue: 1000, cost: 700, period: 'Q3' },
    ]);
    expect(result.degraded).toBe(false);
    expect(result.decomposition).toBeDefined();
    expect(result.breakeven_cross_ref.currentBreakeven).toBeGreaterThan(0);
    expect(result.trendDirection).toBeTruthy();
    expect(result.economicInterpretation.primaryDriver).toBeTruthy();
  });

  it('降级: 收入为0 → degraded', async () => {
    const { computeMarginTrend } = await import('../../extensions/sentinels/shared/computes/l2-value/compute-margin-trend');
    const result = computeMarginTrend(0, 100, []);
    expect(result.degraded).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('边界: 仅1期历史数据 → degraded但有估算', async () => {
    const { computeMarginTrend } = await import('../../extensions/sentinels/shared/computes/l2-value/compute-margin-trend');
    const result = computeMarginTrend(1000, 800, [{ revenue: 1000, cost: 800, period: 'Q1' }]);
    expect(result.degraded).toBe(true);
    expect(result.trendDirection).toBe('stable');
    expect(result.breakeven_cross_ref.currentBreakeven).toBeGreaterThan(0);
  });
});
