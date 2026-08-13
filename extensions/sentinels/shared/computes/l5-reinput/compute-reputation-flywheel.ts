/**
 * compute-reputation-flywheel.ts — 成功交付→好口碑→更多客户 (5.4)
 *
 * @contract COMPUTE-REPUTATION-FLYWHEEL-v1 {ReputationFlywheelInput} {value,confidence,evidence,degraded,warnings} {无声誉数据 → degraded:true, warnings:['无声誉数据 — reputationScore或referralRate未配置']}
 * 模块: l5-reinput/reputation_flywheel
 * 消费边: REPUTATION_FLYWHEEL
 * 输入: reputationScore(0-1), referralRate(0-1)
 * 输出(正常): { value: reputation_score × referral_rate, confidence:'high'|'medium', evidence[], degraded:false }
 * 输出(降级): { value:0, confidence:'low', degraded:true, warnings:['无声誉数据'] }
 *
 * 算法: reputation_score × referral_rate
 */
export interface ReputationFlywheelInput {
  reputationScore: number; // 声誉评分(0-1), -1=未配置
  referralRate: number;    // 推荐率(0-1), -1=未配置
}

export function computeReputationFlywheel(input: ReputationFlywheelInput) {
  const warnings: string[] = [];
  const { reputationScore, referralRate } = input;

  if (reputationScore < 0 || referralRate < 0) {
    return {
      value: 0, confidence: 'low' as const, evidence: [],
      degraded: true, warnings: ['无声誉数据 — reputationScore或referralRate未配置'],
    };
  }

  const clampedRep = Math.max(0, Math.min(1, reputationScore));
  const clampedRef = Math.max(0, Math.min(1, referralRate));

  const value = Math.round(clampedRep * clampedRef * 1000) / 1000;
  const confidence = value > 0.5 ? 'high' as const : 'medium' as const;

  return {
    value,
    confidence,
    evidence: [`reputationScore: ${clampedRep}`, `referralRate: ${clampedRef}`],
    degraded: false,
    warnings,
  };
}
