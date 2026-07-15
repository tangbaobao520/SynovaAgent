/**
 * compute-agency-cost.ts — 代理成本 (Agency Cost)
 *
 * 契约ID: COMPUTE-AGENCY-COST-v1
 * 消费边: E-07/E-15
 * 代理成本 = 监督成本 + 担保成本 + 剩余损失
 *
 * D59 ME Enhance: 追加 economic_interpretation 字段
 */

/** 管理经济学语义解读 */
export interface AgencyCostInterpretation {
  /** 代理成本结构: high_monitoring / high_bonding / balanced */
  agencyCostBreakdown: string;
  /** 治理建议 */
  governanceRecommendation: string;
  /** 效率评级 */
  efficiencyRating: string;
}

export interface AgencyCostResult {
  totalAgencyCost: number;
  monitoringCost: number;
  bondingCost: number;
  residualLoss: number;
  costToRevenueRatio: number;
  /** D59: 管理经济学语义解读 */
  economicInterpretation: AgencyCostInterpretation;
  degraded: boolean;
  warnings: string[];
}

export function computeAgencyCost(
  monitoringCost: number,
  bondingCost: number,
  residualLoss: number,
  revenue: number,
): AgencyCostResult {
  const warnings: string[] = [];

  if (revenue <= 0) {
    return {
      totalAgencyCost: 0, monitoringCost: 0, bondingCost: 0, residualLoss: 0,
      costToRevenueRatio: 0,
      economicInterpretation: {
        agencyCostBreakdown: 'unknown',
        governanceRecommendation: '营收数据无效',
        efficiencyRating: '无法评估',
      },
      degraded: true,
      warnings: ['Revenue must be positive'],
    };
  }

  const totalAgencyCost = monitoringCost + bondingCost + residualLoss;
  const costToRevenueRatio = totalAgencyCost / revenue;

  // Identify dominant cost
  const maxCost = Math.max(monitoringCost, bondingCost, residualLoss);
  const breakdown = maxCost === monitoringCost ? 'high_monitoring' :
    maxCost === bondingCost ? 'high_bonding' : 'high_residual_loss';

  const efficiencyRating = costToRevenueRatio > 0.15 ? 'poor' :
    costToRevenueRatio > 0.08 ? 'moderate' : 'good';

  return {
    totalAgencyCost: Math.round(totalAgencyCost * 100) / 100,
    monitoringCost: Math.round(monitoringCost * 100) / 100,
    bondingCost: Math.round(bondingCost * 100) / 100,
    residualLoss: Math.round(residualLoss * 100) / 100,
    costToRevenueRatio: Math.round(costToRevenueRatio * 10000) / 10000,
    economicInterpretation: {
      agencyCostBreakdown: breakdown,
      governanceRecommendation: costToRevenueRatio > 0.15
        ? '代理成本过高(>15%营收)，建议优化监督机制或调整激励结构'
        : costToRevenueRatio > 0.08
        ? '代理成本处于中等水平，可针对性优化'
        : '代理成本控制在合理范围(<8%营收)',
      efficiencyRating,
    },
    degraded: false,
    warnings,
  };
}
