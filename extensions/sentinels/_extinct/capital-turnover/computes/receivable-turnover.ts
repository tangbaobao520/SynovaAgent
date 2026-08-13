export interface ReceivableTurnoverResult {
  turnoverRatio: number;
  daysOutstanding: number;
  totalRevenue: number;
  avgReceivables: number;
  degraded: boolean;
}
/**
 * Calculate accounts receivable turnover ratio and days sales outstanding.
 * Higher turnover = faster cash collection. Lower DSO = better working capital.
 */
export function computeReceivableTurnover(financials: Array<{ revenue: number; accountsReceivable: number }>): ReceivableTurnoverResult {
  if (financials.length === 0) return { turnoverRatio: 0, daysOutstanding: 0, totalRevenue: 0, avgReceivables: 0, degraded: true };
  const tr = financials.reduce((s, f) => s + f.revenue, 0);
  const ar = financials.reduce((s, f) => s + (f.accountsReceivable || 0), 0);
  const ratio = ar > 0 ? tr / ar : 0;
  return { turnoverRatio: Math.round(ratio * 100) / 100, daysOutstanding: ratio > 0 ? Math.round(365 / ratio) : 0, totalRevenue: tr, avgReceivables: ar, degraded: false };
}
