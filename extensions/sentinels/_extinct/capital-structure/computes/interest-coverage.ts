/**
 * capital-structure/computes/interest-coverage.ts — 利息覆盖倍数计算
 */
export interface InterestCoverageResult {
  icr: number;
  ebit: number;
  interestExpense: number;
  degraded: boolean;
}

export function computeInterestCoverage(financials: Array<{
  operatingIncome: number;
  interestExpense: number;
}>): InterestCoverageResult {
  if (financials.length === 0) {
    return { icr: 0, ebit: 0, interestExpense: 0, degraded: true };
  }
  const ebit = financials.reduce((s, f) => s + (f.operatingIncome || 0), 0);
  const interestExpense = financials.reduce((s, f) => s + (f.interestExpense || 0), 0);
  const icr = interestExpense > 0 ? ebit / interestExpense : (ebit > 0 ? 99 : 0);
  return { icr: Math.round(icr * 100) / 100, ebit, interestExpense, degraded: false };
}
