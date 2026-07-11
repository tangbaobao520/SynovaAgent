/**
 * compute-efficiency-attraction.ts — 运营效率吸引资本 (1.8 二阶)
 *
 * @contract COMPUTE-EFFICIENCY-ATTRACTION-v1 EfficiencyAttractionInput {value,confidence,evidence,degraded,warnings} assetUtilizationRate<0||assetUtilizationRate===0
 * 模块: l1-input/efficiency_attraction
 * 消费边: EFFICIENCY_ATTRACTION
 * 输入: assetUtilizationRate(0-1), operatingMargin(0-1)
 * 输出(正常): { value: 效率吸引因子, confidence, evidence[], degraded:false }
 * 输出(降级): { value:0, confidence:'low', degraded:true, warnings:['利用率为0'] }
 *
 * 算法: attraction_factor = utilization × (0.5 + operating_margin × 0.5)
 */
export interface EfficiencyAttractionInput {
  assetUtilizationRate: number;  // 资产利用率(0-1), -1=未配置
  operatingMargin: number;       // 运营利润率(0-1)
}

export function computeEfficiencyAttraction(input: EfficiencyAttractionInput) {
  const warnings: string[] = [];
  const { assetUtilizationRate, operatingMargin } = input;

  if (assetUtilizationRate < 0) {
    return {
      value: 0, confidence: 'low' as const, evidence: [],
      degraded: true, warnings: ['assetUtilizationRate未配置 — 无法计算效率吸引因子'],
    };
  }

  if (assetUtilizationRate === 0) {
    return {
      value: 0, confidence: 'low' as const, evidence: [],
      degraded: true, warnings: ['利用率为0 — 无运营活动可吸引资本'],
    };
  }

  const clampedUtilization = Math.max(0, Math.min(1, assetUtilizationRate));
  const clampedMargin = Math.max(0, Math.min(1, operatingMargin));

  const attractionFactor = clampedUtilization * (0.5 + clampedMargin * 0.5);
  const value = Math.round(attractionFactor * 1000) / 1000;
  const confidence = clampedUtilization > 0.7 && clampedMargin > 0.1 ? 'high' as const : 'medium' as const;

  return {
    value,
    confidence,
    evidence: [`utilization: ${clampedUtilization}`, `operatingMargin: ${clampedMargin}`],
    degraded: false,
    warnings,
  };
}
