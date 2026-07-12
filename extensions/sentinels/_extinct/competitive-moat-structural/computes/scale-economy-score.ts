/**
 * I3 护城河结构性强度: 规模经济
 *
 * 理论依据: 规模经济 = 固定成本分摊 + 学习曲线效应。
 * 资产周转率 (Revenue / Assets) 是规模经济利用效率的代理。
 *
 * 评分方法:
 * - assetTurnover = totalRevenue / totalAssets
 * - score = min(assetTurnover / 3, 1), 3x 以上为高效
 */
export interface ScaleResult {
  score: number;
  revenue: number;
  assetBase: number;
  degraded: boolean;
}

export function computeScaleEconomy(financials: Array<{ revenue: number; totalAssets: number }>): ScaleResult {
  if (financials.length === 0) return { score: 0, revenue: 0, assetBase: 0, degraded: true };
  const r = financials.reduce((s, f) => s + f.revenue, 0);
  const a = financials.reduce((s, f) => s + (f.totalAssets || 0), 0);
  return { score: Math.min(r / (a || 1) / 3, 1), revenue: r, assetBase: a, degraded: false };
}
