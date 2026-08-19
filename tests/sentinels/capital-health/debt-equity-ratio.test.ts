/**
 * tests/sentinels/capital-health/debt-equity-ratio.test.ts — D358 配对测试（组 2b）
 *
 * 契约: computeDebtEquityRatio(financials: Array<{total_debt, long_term_debt, equity}>)
 *   D/E = total_debt / equity；长期负债比 = long_term_debt / total_debt
 *   降级: 空数组 / equity=0（D358 决策 5: 修复原实现 fallback 99 的假 critical——
 *         equity=0 时 D/E=99 恒触发 >2.5 critical 误报）
 *   边界: 负债显式 0 → D/E 0，不降级（无负债企业）
 */
import { describe, it, expect } from 'vitest';
import { computeDebtEquityRatio } from '../../../extensions/sentinels/capital-health/computes/debt-equity-ratio';

describe('D358 compute-debt-equity-ratio（迁自 _extinct/capital-structure）', () => {
  it('正常: 80/40 → D/E 2.0，长期负债比 0.25', () => {
    const r = computeDebtEquityRatio([
      { total_debt: 80, long_term_debt: 20, equity: 40 },
    ]);
    expect(r.degraded).toBe(false);
    expect(r.debtEquity).toBe(2);
    expect(r.longTermDebtRatio).toBeCloseTo(0.25, 4);
  });

  it('降级: 空数组 → degraded', () => {
    const r = computeDebtEquityRatio([]);
    expect(r.degraded).toBe(true);
  });

  it('降级: equity=0 → degraded（修复原 99 假 critical）', () => {
    const r = computeDebtEquityRatio([
      { total_debt: 80, long_term_debt: 20, equity: 0 },
    ]);
    expect(r.degraded).toBe(true);
  });

  it('边界: 负债显式 0 → D/E 0，不降级', () => {
    const r = computeDebtEquityRatio([
      { total_debt: 0, long_term_debt: 0, equity: 40 },
    ]);
    expect(r.degraded).toBe(false);
    expect(r.debtEquity).toBe(0);
    expect(r.longTermDebtRatio).toBe(0);
  });
});
