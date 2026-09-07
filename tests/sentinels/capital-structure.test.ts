/**
 * capital-structure.test.ts — 资本结构 computes 组合回归
 * D584 对齐: retired capital-structure/computes → capital-health/computes live 契约。
 */
import { describe, it, expect } from 'vitest';
import { computeDebtEquityRatio } from '../../extensions/sentinels/capital-health/computes/debt-equity-ratio';
import { computeInterestCoverage } from '../../extensions/sentinels/capital-health/computes/interest-coverage';

describe('computeDebtEquityRatio', () => {
  it('空 degraded', () => { expect(computeDebtEquityRatio([]).degraded).toBe(true); });
  it('D/E 计算', () => {
    const r = computeDebtEquityRatio([{ total_debt: 200, long_term_debt: 100, equity: 100 }]);
    expect(r.debtEquity).toBe(2);
    expect(r.degraded).toBe(false);
  });
  it('长期负债占比', () => {
    const r = computeDebtEquityRatio([{ total_debt: 300, long_term_debt: 150, equity: 200 }]);
    expect(r.longTermDebtRatio).toBe(0.5);
  });
});
describe('computeInterestCoverage', () => {
  it('空 degraded', () => { expect(computeInterestCoverage([]).degraded).toBe(true); });
  it('ICR 计算', () => {
    const r = computeInterestCoverage([{ operating_cashflow: 100, interest_expense: 20 }]);
    expect(r.icr).toBe(5);
  });
});
