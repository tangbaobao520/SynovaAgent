/**
 * compute-knowledge-sharing.ts — 一个人的经验变成团队的能力 (2.8)
 *
 * 契约ID: COMPUTE-KNOWLEDGE-SHARING-v1
 * 模块: l2-internal/knowledge_sharing
 * 消费边: KNOWLEDGE_SHARING
 * 输入: sharingFrequency(0-1), absorptionCapacity(0-1)
 * 输出(正常): { value: sharing_frequency × absorption_capacity, confidence:'high'|'medium', evidence[], degraded:false }
 * 输出(降级): { value:0, confidence:'low', degraded:true, warnings:['无共享数据'] }
 *
 * 算法: sharing_frequency × absorption_capacity
 */
export interface KnowledgeSharingInput {
  sharingFrequency: number;   // 知识共享频率(0-1), -1=未配置
  absorptionCapacity: number; // 团队吸收能力(0-1), -1=未配置
}

export function computeKnowledgeSharing(input: KnowledgeSharingInput) {
  const warnings: string[] = [];
  const { sharingFrequency, absorptionCapacity } = input;

  if (sharingFrequency < 0 || absorptionCapacity < 0) {
    return {
      value: 0, confidence: 'low' as const, evidence: [],
      degraded: true, warnings: ['无共享数据 — sharingFrequency或absorptionCapacity未配置'],
    };
  }

  const clampedFreq = Math.max(0, Math.min(1, sharingFrequency));
  const clampedCap = Math.max(0, Math.min(1, absorptionCapacity));

  const value = Math.round(clampedFreq * clampedCap * 1000) / 1000;
  const confidence = value > 0.5 ? 'high' as const : 'medium' as const;

  return {
    value,
    confidence,
    evidence: [`sharingFrequency: ${clampedFreq}`, `absorptionCapacity: ${clampedCap}`],
    degraded: false,
    warnings,
  };
}
