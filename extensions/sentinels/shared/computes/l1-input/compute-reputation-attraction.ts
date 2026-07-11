/**
 * compute-reputation-attraction.ts — 声誉对外部资源的吸引 (1.7 二阶)
 *
 * @contract COMPUTE-REPUTATION-ATTRACTION-v1 ReputationAttractionInput {value,confidence,evidence,degraded,warnings} reputationScore<0
 * 模块: l1-input/reputation_attraction
 * 消费边: REPUTATION_ATTRACTION
 * 输入: reputationScore(0-1), attractionMultiplier(number)
 * 输出(正常): { value: 声誉吸引强度, confidence, evidence[], degraded:false }
 * 输出(降级): { value:0, confidence:'low', degraded:true, warnings:['无声誉数据'] }
 *
 * 算法: attraction_power = reputation_score × attraction_multiplier
 */
export interface ReputationAttractionInput {
  reputationScore: number;         // 声誉评分(0-1), -1=未配置
  attractionMultiplier: number;    // 吸引乘数(0-2)
}

export function computeReputationAttraction(input: ReputationAttractionInput) {
  const warnings: string[] = [];
  const { reputationScore, attractionMultiplier } = input;

  if (reputationScore < 0) {
    return {
      value: 0, confidence: 'low' as const, evidence: [],
      degraded: true, warnings: ['无声誉数据 — reputationScore未配置'],
    };
  }

  const clampedScore = Math.max(0, Math.min(1, reputationScore));
  const clampedMultiplier = Math.max(0, Math.min(2, attractionMultiplier));

  const attractionPower = clampedScore * clampedMultiplier;
  const value = Math.round(Math.min(1, attractionPower) * 1000) / 1000;
  const confidence = clampedScore > 0.7 ? 'high' as const : 'medium' as const;

  return {
    value,
    confidence,
    evidence: [`reputationScore: ${clampedScore}`, `multiplier: ${clampedMultiplier}`],
    degraded: false,
    warnings,
  };
}
