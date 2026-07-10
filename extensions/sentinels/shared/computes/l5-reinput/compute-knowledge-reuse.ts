/**
 * compute-knowledge-reuse.ts — 知识复用 (5.3)
 *
 * 契约ID: COMPUTE-KNOWLEDGE-REUSE-v1
 * 模块: l5-reinput/knowledge_reuse
 * 消费边: KNOWLEDGE_REUSE
 * 输入: reuseFrequency(0-1), knowledgeDecay(0-1)
 * 输出(正常): { value: reuse_frequency × (1 - knowledge_decay), confidence:'high'|'medium', evidence[], degraded:false }
 * 输出(降级): { value:0, confidence:'low', degraded:true, warnings:['无知识数据'] }
 *
 * 算法: reuse_frequency × (1 - knowledge_decay)
 */
export interface KnowledgeReuseInput {
  reuseFrequency: number;  // 复用频率(0-1), -1=未配置
  knowledgeDecay: number;  // 知识衰减率(0-1), -1=未配置
}

export function computeKnowledgeReuse(input: KnowledgeReuseInput) {
  const warnings: string[] = [];
  const { reuseFrequency, knowledgeDecay } = input;

  if (reuseFrequency < 0 || knowledgeDecay < 0) {
    return {
      value: 0, confidence: 'low' as const, evidence: [],
      degraded: true, warnings: ['无知识数据 — reuseFrequency或knowledgeDecay未配置'],
    };
  }

  const clampedFreq = Math.max(0, Math.min(1, reuseFrequency));
  const clampedDecay = Math.max(0, Math.min(1, knowledgeDecay));

  const value = Math.round(clampedFreq * (1 - clampedDecay) * 1000) / 1000;
  const confidence = value > 0.5 ? 'high' as const : 'medium' as const;

  return {
    value,
    confidence,
    evidence: [`reuseFrequency: ${clampedFreq}`, `knowledgeDecay: ${clampedDecay}`],
    degraded: false,
    warnings,
  };
}
