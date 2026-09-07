/**
 * wacc.test.ts — computeWacc 契约测试
 * D584 对齐: retired capital-efficiency/computes → capital-health/computes live 契约
 * （input: {equity, total_debt, tax_rate}[] + WaccParams{riskFree, marketReturn, beta}）。
 */
import { describe, it, expect } from 'vitest';
import { computeWacc } from '../../../extensions/sentinels/capital-health/computes/wacc';

describe('computeWacc', () => {
  it('标准输入: 0 < wacc < 1 且不降级', () => {
    const r = computeWacc([{ equity: 5000000, total_debt: 3000000, tax_rate: 0.25 }]);
    expect(r.wacc).toBeGreaterThan(0);
    expect(r.wacc).toBeLessThan(1);
    expect(r.degraded).toBe(false);
  });

  it('空数据 degraded', () => {
    const r = computeWacc([]);
    expect(r.degraded).toBe(true);
  });

  it('自定义 params + 零负债 → debtWeight 0', () => {
    const r = computeWacc([{ equity: 10000000, total_debt: 0, tax_rate: 0.25 }], { riskFree: 0.05, marketReturn: 0.12, beta: 1.2 });
    expect(r.debtWeight).toBe(0);
    expect(r.wacc).toBeGreaterThan(0);
  });
});
