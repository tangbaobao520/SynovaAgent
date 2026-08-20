/**
 * tests/sentinels/margin-health/compute-gross-margin.test.ts — D358 配对测试（组 2b）
 *
 * 契约: computeGrossMargin(financials: Array<{total_revenue, gross_margin}>)
 *   erp-standard: gross_margin prop = 毛利润金额（非比率），total_revenue = 营业收入
 *   正常: value = gross_profit / total_revenue（毛利率 0-1）
 *   降级: 空数组 / total_revenue=0（分母 guard，防 0/0 假值）
 *   边界: gross_margin 显式 0（无毛利企业）→ value 0 且不降级（显式 0 ≠ 缺失）
 */
import { describe, it, expect } from 'vitest';
import { computeGrossMargin } from '../../../extensions/sentinels/margin-health/computes/compute-gross-margin';

describe('D358 compute-gross-margin（迁自 _extinct/cost-health）', () => {
  it('正常: 毛利润 30 / 收入 100 → 毛利率 0.3', () => {
    const r = computeGrossMargin([{ total_revenue: 100, gross_margin: 30 }]);
    expect(r.degraded).toBe(false);
    expect(r.value).toBeCloseTo(0.3, 4);
    expect(r.evidence.some(e => e.includes('100'))).toBe(true);
  });

  it('降级: 空数组 → degraded', () => {
    const r = computeGrossMargin([]);
    expect(r.degraded).toBe(true);
    expect(r.value).toBe(0);
  });

  it('降级: total_revenue=0 → degraded（分母 guard，不产 NaN/假值）', () => {
    const r = computeGrossMargin([{ total_revenue: 0, gross_margin: 0 }]);
    expect(r.degraded).toBe(true);
    expect(Number.isFinite(r.value)).toBe(true);
  });

  it('边界: gross_margin 显式 0（收入>0）→ value 0，不降级', () => {
    const r = computeGrossMargin([{ total_revenue: 100, gross_margin: 0 }]);
    expect(r.degraded).toBe(false);
    expect(r.value).toBe(0);
  });
});
