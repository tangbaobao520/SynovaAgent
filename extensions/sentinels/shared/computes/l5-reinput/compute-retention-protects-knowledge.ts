/**
 * compute-retention-protects-knowledge.ts — 人才留存保护知识资产 (5.5)
 *
 * @contract COMPUTE-RETENTION-PROTECTS-KNOWLEDGE-v1 {RetentionProtectsKnowledgeInput} {value,confidence,evidence,degraded,warnings} {无数据 → degraded:true, warnings:['无数据 — retentionRate或knowledgeLossRate未配置']}
 * 模块: l5-reinput/retention_protects_knowledge
 * 消费边: RETENTION_PROTECTS_KNOWLEDGE
 * 输入: retentionRate(0-1), knowledgeLossRate(0-1)
 * 输出(正常): { value: retention_rate × (1 - knowledge_loss_rate), confidence:'high'|'medium', evidence[], degraded:false }
 * 输出(降级): { value:0, confidence:'low', degraded:true, warnings:['无数据'] }
 *
 * 算法: retention_rate × (1 - knowledge_loss_rate)
 */
export interface RetentionProtectsKnowledgeInput {
  retentionRate: number;    // 人才留存率(0-1), -1=未配置
  knowledgeLossRate: number; // 知识流失率(0-1), -1=未配置
}

export function computeRetentionProtectsKnowledge(input: RetentionProtectsKnowledgeInput) {
  const warnings: string[] = [];
  const { retentionRate, knowledgeLossRate } = input;

  if (retentionRate < 0 || knowledgeLossRate < 0) {
    return {
      value: 0, confidence: 'low' as const, evidence: [],
      degraded: true, warnings: ['无数据 — retentionRate或knowledgeLossRate未配置'],
    };
  }

  const clampedRetention = Math.max(0, Math.min(1, retentionRate));
  const clampedLoss = Math.max(0, Math.min(1, knowledgeLossRate));

  const value = Math.round(clampedRetention * (1 - clampedLoss) * 1000) / 1000;
  const confidence = value > 0.5 ? 'high' as const : 'medium' as const;

  return {
    value,
    confidence,
    evidence: [`retentionRate: ${clampedRetention}`, `knowledgeLossRate: ${clampedLoss}`],
    degraded: false,
    warnings,
  };
}
