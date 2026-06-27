export interface ScaleResult { score: number; revenue: number; assetBase: number; degraded: boolean; }
export function computeScaleEconomy(financials: Array<{ revenue: number; totalAssets: number }>): ScaleResult {
  if (financials.length === 0) return { score: 0, revenue: 0, assetBase: 0, degraded: true };
  const r = financials.reduce((s, f) => s + f.revenue, 0);
  const a = financials.reduce((s, f) => s + (f.totalAssets || 0), 0);
  return { score: Math.min(r / (a || 1) / 3, 1), revenue: r, assetBase: a, degraded: false };
}
