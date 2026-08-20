/**
 * tests/sentinels/capital-health/asset-turnover.test.ts — D358 配对测试（组 2b）
 *
 * 契约: computeAssetTurnover(financials: Array<{total_revenue, total_assets, current_assets}>)
 *   总资产周转率 = total_revenue / total_assets；流动资产周转率 = total_revenue / current_assets
 *   降级: 空数组 / total_assets=0（D358 决策 5: 修复原实现 fallback 0 的假 critical——
 *         total_assets=0 时周转率 0 恒 <0.5 触发 critical 误报）
 *   边界: 总周转率恰好 0.5（critical 阈值线）
 */
import { describe, it, expect } from 'vitest';
import { computeAssetTurnover } from '../../../extensions/sentinels/capital-health/computes/asset-turnover';

describe('D358 compute-asset-turnover（迁自 _extinct/capital-turnover）', () => {
  it('正常: 100/50 → 总周转率 2.0，100/100 → 流动周转率 1.0', () => {
    const r = computeAssetTurnover([
      { total_revenue: 100, total_assets: 50, current_assets: 100 },
    ]);
    expect(r.degraded).toBe(false);
    expect(r.totalTurnover).toBe(2);
    expect(r.currentTurnover).toBe(1);
  });

  it('降级: 空数组 → degraded', () => {
    const r = computeAssetTurnover([]);
    expect(r.degraded).toBe(true);
  });

  it('降级: total_assets=0 → degraded（修复原 0 假 critical）', () => {
    const r = computeAssetTurnover([
      { total_revenue: 100, total_assets: 0, current_assets: 100 },
    ]);
    expect(r.degraded).toBe(true);
  });

  it('边界: 总周转率恰好 0.5 → 值 0.5，不降级', () => {
    const r = computeAssetTurnover([
      { total_revenue: 50, total_assets: 100, current_assets: 100 },
    ]);
    expect(r.degraded).toBe(false);
    expect(r.totalTurnover).toBeCloseTo(0.5, 4);
  });
});
