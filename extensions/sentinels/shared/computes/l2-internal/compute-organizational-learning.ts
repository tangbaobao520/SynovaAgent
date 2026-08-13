/**
 * compute-organizational-learning.ts — 经验积累提升整体运行效率 (2.7)
 *
 * @contract COMPUTE-ORGANIZATIONAL-LEARNING-v1 OrganizationalLearningInput {value,confidence,evidence,degraded,warnings} learningRate<0||knowledgeRetention<0
 * 模块: l2-internal/organizational_learning
 * 消费边: ORGANIZATIONAL_LEARNING
 * 输入: learningRate(0-1), knowledgeRetention(0-1)
 * 输出(正常): { value: learning_rate × knowledge_retention, confidence:'high'|'medium', evidence[], degraded:false }
 * 输出(降级): { value:0, confidence:'low', degraded:true, warnings:['无学习数据'] }
 *
 * 算法: learning_rate × knowledge_retention
 */
export interface OrganizationalLearningInput {
  learningRate: number;        // 学习速率(0-1), -1=未配置
  knowledgeRetention: number;  // 知识保持率(0-1), -1=未配置
}

export function computeOrganizationalLearning(input: OrganizationalLearningInput) {
  const warnings: string[] = [];
  const { learningRate, knowledgeRetention } = input;

  if (learningRate < 0 || knowledgeRetention < 0) {
    return {
      value: 0, confidence: 'low' as const, evidence: [],
      degraded: true, warnings: ['无学习数据 — learningRate或knowledgeRetention未配置'],
    };
  }

  const clampedRate = Math.max(0, Math.min(1, learningRate));
  const clampedRetention = Math.max(0, Math.min(1, knowledgeRetention));

  const value = Math.round(clampedRate * clampedRetention * 1000) / 1000;
  const confidence = value > 0.5 ? 'high' as const : 'medium' as const;

  return {
    value,
    confidence,
    evidence: [`learningRate: ${clampedRate}`, `knowledgeRetention: ${clampedRetention}`],
    degraded: false,
    warnings,
  };
}
