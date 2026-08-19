/**
 * tests/sentinels/capital-health/receivable-turnover.test.ts — D358 配对测试（组 2b）
 *
 * 契约: computeReceivableTurnover(financials: Array<{total_revenue, receivables}>)
 *   周转率 = total_revenue / receivables；周转天数 = 365 / 周转率
 *   （erp-standard: 应收账款 prop = receivables，归一化映射 accountsReceivable → receivables）
 *   降级: 空数组 / receivables=0（D358 决策 5: 修复原实现 fallback 0 天的假 healthy——
 *         应收为 0 时天数 0 恒「健康」，掩盖缺失数据）
 *   边界: 周转天数恰好 60（warning 阈值线）
 */
import { describe, it, expect } from 'vitest';
import { computeReceivableTurnover } from '../../../extensions/sentinels/capital-health/computes/receivable-turnover';

describe('D358 compute-receivable-turnover（迁自 _extinct/capital-turnover）', () => {
  it('正常: 365/100 → 周转率 3.65 → 100 天', () => {
    const r = computeReceivableTurnover([
      { total_revenue: 365, receivables: 100 },
    ]);
    expect(r.degraded).toBe(false);
    expect(r.turnoverRatio).toBeCloseTo(3.65, 2);
    expect(r.daysOutstanding).toBe(100);
  });

  it('降级: 空数组 → degraded', () => {
    const r = computeReceivableTurnover([]);
    expect(r.degraded).toBe(true);
  });

  it('降级: receivables=0 → degraded（修复原 0 天假 healthy）', () => {
    const r = computeReceivableTurnover([
      { total_revenue: 365, receivables: 0 },
    ]);
    expect(r.degraded).toBe(true);
  });

  it('边界: 周转天数恰好 60 → 值 60，不降级', () => {
    const r = computeReceivableTurnover([
      { total_revenue: 365, receivables: 60 },
    ]);
    expect(r.degraded).toBe(false);
    expect(r.daysOutstanding).toBe(60);
  });
});
