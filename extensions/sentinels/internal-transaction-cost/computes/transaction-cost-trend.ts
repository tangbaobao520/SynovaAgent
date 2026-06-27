export interface CostTrendResult { adminCostRatio: number; trend: number; teamCount: number; eventCount: number; degraded: boolean; signals: string[]; }
export function computeTransactionCostTrend(params: { totalCost: number; adminCost: number; teamCount: number; eventCount: number; previousAdminCost: number; previousTotalCost: number }): CostTrendResult {
  const { totalCost, adminCost, teamCount, eventCount, previousAdminCost, previousTotalCost } = params;
  if (totalCost === 0) return { adminCostRatio: 0, trend: 0, teamCount: 0, eventCount: 0, degraded: true, signals: ['无成本数据'] };
  const adminCostRatio = totalCost > 0 ? adminCost / totalCost : 0;
  const prevRatio = previousTotalCost > 0 ? previousAdminCost / previousTotalCost : 0;
  const trend = prevRatio > 0 ? (adminCostRatio - prevRatio) / prevRatio : 0;
  const signals: string[] = [];
  if (trend > 0.1) signals.push('管理成本占比上升超过10%');
  if (teamCount > 20) signals.push(`团队数量(${teamCount})较多，协调成本可能偏高`);
  return { adminCostRatio: Math.round(adminCostRatio * 100) / 100, trend: Math.round(trend * 1000) / 1000, teamCount, eventCount, degraded: false, signals };
}
