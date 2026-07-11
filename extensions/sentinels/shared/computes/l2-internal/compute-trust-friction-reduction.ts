/**
 * compute-trust-friction-reduction.ts — 团队成员间的信任降低协作摩擦 (2.9)
 *
 * @contract COMPUTE-TRUST-FRICTION-REDUCTION-v1 TrustFrictionReductionInput {value,confidence,evidence,degraded,warnings} trustLevel<0||collaborationEfficiency<0
 * 模块: l2-internal/trust_friction_reduction
 * 消费边: TRUST_FRICTION_REDUCTION
 * 输入: trustLevel(0-1), collaborationEfficiency(0-1)
 * 输出(正常): { value: trust_level × collaboration_efficiency, confidence:'high'|'medium', evidence[], degraded:false }
 * 输出(降级): { value:0, confidence:'low', degraded:true, warnings:['无信任数据'] }
 *
 * 算法: trust_level × collaboration_efficiency
 */
export interface TrustFrictionReductionInput {
  trustLevel: number;              // 团队信任水平(0-1), -1=未配置
  collaborationEfficiency: number; // 协作效率(0-1), -1=未配置
}

export function computeTrustFrictionReduction(input: TrustFrictionReductionInput) {
  const warnings: string[] = [];
  const { trustLevel, collaborationEfficiency } = input;

  if (trustLevel < 0 || collaborationEfficiency < 0) {
    return {
      value: 0, confidence: 'low' as const, evidence: [],
      degraded: true, warnings: ['无信任数据 — trustLevel或collaborationEfficiency未配置'],
    };
  }

  const clampedTrust = Math.max(0, Math.min(1, trustLevel));
  const clampedCollab = Math.max(0, Math.min(1, collaborationEfficiency));

  const value = Math.round(clampedTrust * clampedCollab * 1000) / 1000;
  const confidence = value > 0.5 ? 'high' as const : 'medium' as const;

  return {
    value,
    confidence,
    evidence: [`trustLevel: ${clampedTrust}`, `collaborationEfficiency: ${clampedCollab}`],
    degraded: false,
    warnings,
  };
}
