/**
 * tests/sentinels/capital-health/interest-coverage.test.ts — D358 配对测试（组 2b）
 *
 * 契约: computeInterestCoverage(financials: Array<{operating_cashflow, interest_expense}>)
 *   EBIT 近似 = operating_cashflow（D358 归一化映射: operatingIncome/operatingCashFlow → operating_cashflow）
 *   ICR = ebit / interest_expense
 *   降级: 空数组 / interest_expense=0（D358 决策 5: 修复原实现 fallback 99 的假 healthy——
 *         利息为 0 时 ICR=99 恒「健康」，掩盖缺失数据）
 *   边界: ICR 恰好 1.5（critical 阈值线）
 */
import { describe, it, expect } from 'vitest';
import { computeInterestCoverage } from '../../../extensions/sentinels/capital-health/computes/interest-coverage';

describe('D358 compute-interest-coverage（迁自 _extinct/capital-structure）', () => {
  it('正常: 30 / 10 → ICR 3.0', () => {
    const r = computeInterestCoverage([
      { operating_cashflow: 30, interest_expense: 10 },
    ]);
    expect(r.degraded).toBe(false);
    expect(r.icr).toBe(3);
  });

  it('降级: 空数组 → degraded', () => {
    const r = computeInterestCoverage([]);
    expect(r.degraded).toBe(true);
  });

  it('降级: interest_expense=0 → degraded（修复原 99 假 healthy）', () => {
    const r = computeInterestCoverage([
      { operating_cashflow: 30, interest_expense: 0 },
    ]);
    expect(r.degraded).toBe(true);
  });

  it('边界: ICR 恰好 1.5 → 值 1.5，不降级', () => {
    const r = computeInterestCoverage([
      { operating_cashflow: 15, interest_expense: 10 },
    ]);
    expect(r.degraded).toBe(false);
    expect(r.icr).toBeCloseTo(1.5, 4);
  });
});
