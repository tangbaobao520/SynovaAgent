/**
 * compute-talent-retention.ts — 人才留存 (5.2)
 *
 * 契约ID: COMPUTE-TALENT-RETENTION-v1
 * 模块: l5-reinput/talent_retention
 * 消费边: TALENT_RETENTION
 * 输入: retentionRate(0-1), satisfactionScore(0-1)
 * 输出(正常): { value: retention_rate × satisfaction_score, confidence:'high'|'medium', evidence[], degraded:false }
 * 输出(降级): { value:0, confidence:'low', degraded:true, warnings:['无人事数据'] }
 *
 * 算法: retention_rate × satisfaction_score
 */
export interface TalentRetentionInput {
  retentionRate: number;     // 人才留存率(0-1), -1=未配置
  satisfactionScore: number; // 满意度评分(0-1), -1=未配置
}

export function computeTalentRetention(input: TalentRetentionInput) {
  const warnings: string[] = [];
  const { retentionRate, satisfactionScore } = input;

  if (retentionRate < 0 || satisfactionScore < 0) {
    return {
      value: 0, confidence: 'low' as const, evidence: [],
      degraded: true, warnings: ['无人事数据 — retentionRate或satisfactionScore未配置'],
    };
  }

  const clampedRetention = Math.max(0, Math.min(1, retentionRate));
  const clampedSatisfaction = Math.max(0, Math.min(1, satisfactionScore));

  const value = Math.round(clampedRetention * clampedSatisfaction * 1000) / 1000;
  const confidence = value > 0.5 ? 'high' as const : 'medium' as const;

  return {
    value,
    confidence,
    evidence: [`retentionRate: ${clampedRetention}`, `satisfactionScore: ${clampedSatisfaction}`],
    degraded: false,
    warnings,
  };
}
