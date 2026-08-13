/**
 * I11: 内部交易成本增长率
 *
 * 理论依据: Coase/Williamson 企业边界理论。企业内部管理成本上升
 * 意味着组织复杂度增加、协调效率下降。当管理成本比率趋势持续上升
 * 时，企业应考虑数字化或分拆。
 *
 * 评分方法:
 * - adminCostRatio = 管理费用 / 总成本
 * - trend = (本期比率 - 上期比率) / 上期比率
 * - trend > 0.1 → 发出管理成本膨胀信号
 * - teamCount > 20 → 协调复杂度信号
 */
export interface CostTrendResult {
  adminCostRatio: number;
  trend: number;
  teamCount: number;
  eventCount: number;
  degraded: boolean;
  signals: string[];
}

export function computeTransactionCostTrend(params: {
  totalCost: number;
  adminCost: number;
  teamCount: number;
  eventCount: number;
  previousAdminCost: number;
  previousTotalCost: number;
}): CostTrendResult {
  const { totalCost, adminCost, teamCount, eventCount, previousAdminCost, previousTotalCost } = params;
  if (totalCost === 0) {
    return { adminCostRatio: 0, trend: 0, teamCount: 0, eventCount: 0, degraded: true, signals: ['无成本数据'] };
  }
  const adminCostRatio = totalCost > 0 ? adminCost / totalCost : 0;
  const prevRatio = previousTotalCost > 0 ? previousAdminCost / previousTotalCost : 0;
  const trend = prevRatio > 0 ? (adminCostRatio - prevRatio) / prevRatio : 0;
  const signals: string[] = [];
  if (trend > 0.1) signals.push('管理成本占比上升超过10%');
  if (trend > 0.2) signals.push('管理成本占比加速上升，警惕组织膨胀');
  if (teamCount > 20) signals.push(`团队数量(${teamCount})较多，协调成本可能偏高`);
  return {
    adminCostRatio: Math.round(adminCostRatio * 100) / 100,
    trend: Math.round(trend * 1000) / 1000,
    teamCount,
    eventCount,
    degraded: false,
    signals,
  };
}
