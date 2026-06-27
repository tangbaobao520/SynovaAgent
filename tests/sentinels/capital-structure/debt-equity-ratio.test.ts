import { describe, it, expect } from 'vitest';
import { computeDebtEquityRatio } from '../../extensions/sentinels/capital-structure/computes/debt-equity-ratio';
import { computeInterestCoverage } from '../../extensions/sentinels/capital-structure/computes/interest-coverage';
describe('computeDebtEquityRatio', () => {
  it('空degraded', () => { expect(computeDebtEquityRatio([]).degraded).toBe(true); });
  it('D/E计算', () => {
    const r = computeDebtEquityRatio([{ totalDebt: 200, longTermDebt: 100, equity: 100 }]);
    expect(r.debtEquity).toBe(2);
    expect(r.degraded).toBe(false);
  });
  it('长期负债占比', () => {
    const r = computeDebtEquityRatio([{ totalDebt: 300, longTermDebt: 150, equity: 200 }]);
    expect(r.longTermDebtRatio).toBe(0.5);
  });
});
describe('computeInterestCoverage', () => {
  it('空degraded', () => { expect(computeInterestCoverage([]).degraded).toBe(true); });
  it('ICR计算', () => {
    const r = computeInterestCoverage([{ operatingIncome: 100, interestExpense: 20 }]);
    expect(r.icr).toBe(5);
  });
});
