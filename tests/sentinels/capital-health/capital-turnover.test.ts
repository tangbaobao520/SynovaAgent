/**
 * tests/sentinels/capital-health/capital-turnover.test.ts — D358 配对测试（组 2b）
 *
 * 契约: computeCapitalTurnover(financials: Array<{total_revenue, total_debt?, equity?}>)
 *   周转率 = total_revenue / (total_debt + equity)
 *   降级: 空数组 / total_revenue=0 / 投入资本=0（D358 决策 5:
 *         修复原实现 fallback rev/1 的假值——无资本数据不得产出周转率）
 *   边界: 周转率恰好 0.8
 */
import { describe, it, expect } from 'vitest';
import { computeCapitalTurnover } from '../../../extensions/sentinels/capital-health/computes/capital-turnover';

describe('D358 compute-capital-turnover（迁自 _extinct/capital-efficiency）', () => {
  it('正常: 100 / (40+60) → 1.0', () => {
    const r = computeCapitalTurnover([
      { total_revenue: 100, total_debt: 40, equity: 60 },
    ]);
    expect(r.degraded).toBe(false);
    expect(r.turnover).toBe(1);
  });

  it('降级: 空数组 → degraded', () => {
    const r = computeCapitalTurnover([]);
    expect(r.degraded).toBe(true);
  });

  it('降级: 投入资本=0 → degraded（修复原 rev/1 假值）', () => {
    const r = computeCapitalTurnover([
      { total_revenue: 100, total_debt: 0, equity: 0 },
    ]);
    expect(r.degraded).toBe(true);
  });

  it('降级: total_revenue=0 → degraded', () => {
    const r = computeCapitalTurnover([
      { total_revenue: 0, total_debt: 40, equity: 60 },
    ]);
    expect(r.degraded).toBe(true);
  });

  it('边界: 周转率恰好 0.8 → 值 0.8，不降级', () => {
    const r = computeCapitalTurnover([
      { total_revenue: 80, total_debt: 40, equity: 60 },
    ]);
    expect(r.degraded).toBe(false);
    expect(r.turnover).toBeCloseTo(0.8, 4);
  });
});
