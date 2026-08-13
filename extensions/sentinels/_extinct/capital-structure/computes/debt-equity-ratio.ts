/**
 * capital-structure/computes/debt-equity-ratio.ts — 负债权益比计算
 */
export interface DebtEquityResult {
  debtEquity: number;
  longTermDebtRatio: number;
  totalDebt: number;
  totalEquity: number;
  degraded: boolean;
}

export function computeDebtEquityRatio(financials: Array<{
  totalDebt: number;
  longTermDebt: number;
  equity: number;
}>): DebtEquityResult {
  if (financials.length === 0) {
    return { debtEquity: 0, longTermDebtRatio: 0, totalDebt: 0, totalEquity: 0, degraded: true };
  }
  const totalDebt = financials.reduce((s, f) => s + (f.totalDebt || 0), 0);
  const totalLtDebt = financials.reduce((s, f) => s + (f.longTermDebt || 0), 0);
  const totalEquity = financials.reduce((s, f) => s + (f.equity || 0), 0);
  const debtEquity = totalEquity > 0 ? totalDebt / totalEquity : (totalDebt > 0 ? 99 : 0);
  const longTermDebtRatio = totalDebt > 0 ? totalLtDebt / totalDebt : 0;
  return { debtEquity: Math.round(debtEquity * 100) / 100, longTermDebtRatio: Math.round(longTermDebtRatio * 100) / 100, totalDebt, totalEquity, degraded: false };
}
