export interface AssetTurnoverResult {
  totalTurnover: number;
  currentTurnover: number;
  totalRevenue: number;
  totalAssets: number;
  currentAssets: number;
  degraded: boolean;
}
export function computeAssetTurnover(financials: Array<{ revenue: number; totalAssets: number; currentAssets: number }>): AssetTurnoverResult {
  if (financials.length === 0) return { totalTurnover: 0, currentTurnover: 0, totalRevenue: 0, totalAssets: 0, currentAssets: 0, degraded: true };
  const tr = financials.reduce((s, f) => s + f.revenue, 0);
  const ta = financials.reduce((s, f) => s + (f.totalAssets || 0), 0);
  const ca = financials.reduce((s, f) => s + (f.currentAssets || 0), 0);
  return { totalTurnover: ta > 0 ? Math.round((tr / ta) * 100) / 100 : 0, currentTurnover: ca > 0 ? Math.round((tr / ca) * 100) / 100 : 0, totalRevenue: tr, totalAssets: ta, currentAssets: ca, degraded: false };
}
