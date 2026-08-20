/**
 * tests/sentinels/capital-health/wacc.test.ts — D358 配对测试（组 2b）
 *
 * 契约: computeWacc(financials: Array<{equity, total_debt, tax_rate}>, params?)
 *   WACC = (E/V)×re + (D/V)×rd×(1−tax)；re = rf + β×(rm−rf)（CAPM）
 *   字段名已对齐 snake_case（迁移机械重命名，公式不变）
 *   降级: 空数组 / 总资本=0 / 单侧资本缺失（equity 或 debt 为 0 → partial）
 *   边界: equity=debt → creditSpread 取 0.03 档
 */
import { describe, it, expect } from 'vitest';
import { computeWacc } from '../../../extensions/sentinels/capital-health/computes/wacc';

describe('D358 compute-wacc（迁自 _extinct/capital-efficiency）', () => {
  it('正常: equity 60 / debt 40 / tax 25% → wacc 0.075', () => {
    const r = computeWacc([{ equity: 60, total_debt: 40, tax_rate: 0.25 }]);
    expect(r.degraded).toBe(false);
    // eW=0.6, dW=0.4; re=0.10, rd=0.05（debt<equity 档 0.02）; wacc=0.6×0.1+0.4×0.05×0.75=0.075
    expect(r.wacc).toBeCloseTo(0.075, 4);
  });

  it('降级: 空数组 → degraded', () => {
    const r = computeWacc([]);
    expect(r.degraded).toBe(true);
    expect(r.wacc).toBe(0);
  });

  it('降级: 总资本=0 → degraded', () => {
    const r = computeWacc([{ equity: 0, total_debt: 0, tax_rate: 0.25 }]);
    expect(r.degraded).toBe(true);
  });

  it('降级: 单侧资本缺失（equity=0）→ degraded（partial capital）', () => {
    const r = computeWacc([{ equity: 0, total_debt: 100, tax_rate: 0.25 }]);
    expect(r.degraded).toBe(true);
    expect(r.warnings.some(w => w.includes('Partial'))).toBe(true);
  });

  it('边界: equity=debt → debtWeight 0.5，creditSpread 0.03 档', () => {
    const r = computeWacc([{ equity: 50, total_debt: 50, tax_rate: 0.25 }]);
    expect(r.degraded).toBe(false);
    expect(r.equityWeight).toBe(0.5);
    expect(r.costOfDebt).toBeCloseTo(0.06, 4); // rf 0.03 + 0.03
  });
});
