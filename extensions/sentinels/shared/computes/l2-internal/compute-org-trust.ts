/**
 * compute-org-trust.ts — 组织内信任指数与协作评分 (E-21)
 *
 * @contract COMPUTE-ORG-TRUST-v1 OrgTrustInput {value,confidence,evidence,degraded,warnings} trustIndex<0
 * 模块: l2-internal/org_trust
 * 消费边: ORG_TRUST
 * 输入: trustIndex(0-1), collaborationScore(0-1)
 * 输出(正常): { value: trust_index × collaboration_score, confidence, evidence[], degraded:false }
 * 输出(降级): { value:0, confidence:'low', degraded:true, warnings:['无信任数据'] }
 *
 * 算法: trust_index × collaboration_score
 */
export interface OrgTrustInput {
  trustIndex: number;           // 组织信任指数(0-1), -1=未配置
  collaborationScore: number;   // 协作评分(0-1), -1=未配置
}

export function computeOrgTrust(input: OrgTrustInput) {
  const warnings: string[] = [];
  const { trustIndex, collaborationScore } = input;

  if (trustIndex < 0 && collaborationScore < 0) {
    return {
      value: 0, confidence: 'low' as const, evidence: [],
      degraded: true, warnings: ['无组织信任数据 — trustIndex与collaborationScore均未配置'],
    };
  }

  const clampedTrust = Math.max(0, Math.min(1, trustIndex >= 0 ? trustIndex : 0.5));
  const clampedCollab = Math.max(0, Math.min(1, collaborationScore >= 0 ? collaborationScore : 0.5));

  const value = Math.round(clampedTrust * clampedCollab * 1000) / 1000;
  const confidence = value > 0.5 ? 'high' as const : value > 0.2 ? 'medium' as const : 'low' as const;

  return {
    value,
    confidence,
    evidence: [`trustIndex: ${clampedTrust}`, `collaborationScore: ${clampedCollab}`],
    degraded: false,
    warnings,
  };
}
