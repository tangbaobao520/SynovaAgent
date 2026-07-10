/**
 * compute-incentive-alignment.ts — 让人的行为与组织目标一致 (2.5)
 *
 * 契约ID: COMPUTE-INCENTIVE-ALIGNMENT-v1
 * 模块: l2-internal/incentive_alignment
 * 消费边: INCENTIVE_ALIGNMENT
 * 输入: kpiGoalCongruence(0-1), incentiveDistortion(0-1)
 * 输出(正常): { value: kpi_congruence × (1 - distortion), confidence:'high'|'medium', evidence[], degraded:false }
 * 输出(降级): { value:0, confidence:'low', degraded:true, warnings:['无KPI数据'] }
 *
 * 算法: kpi_goal_congruence × (1 - incentive_distortion)
 */
export interface IncentiveAlignmentInput {
  kpiGoalCongruence: number;  // KPI目标一致性(0-1), -1=未配置
  incentiveDistortion: number; // 激励扭曲度(0-1)
}

export function computeIncentiveAlignment(input: IncentiveAlignmentInput) {
  const warnings: string[] = [];
  const { kpiGoalCongruence, incentiveDistortion } = input;

  if (kpiGoalCongruence < 0) {
    return {
      value: 0, confidence: 'low' as const, evidence: [],
      degraded: true, warnings: ['无KPI数据 — kpiGoalCongruence未配置'],
    };
  }

  const clampedCongruence = Math.max(0, Math.min(1, kpiGoalCongruence));
  const clampedDistortion = Math.max(0, Math.min(1, incentiveDistortion));

  const value = Math.round(clampedCongruence * (1 - clampedDistortion) * 1000) / 1000;
  const confidence = value > 0.5 ? 'high' as const : 'medium' as const;

  return {
    value,
    confidence,
    evidence: [`kpiGoalCongruence: ${clampedCongruence}`, `incentiveDistortion: ${clampedDistortion}`],
    degraded: false,
    warnings,
  };
}
