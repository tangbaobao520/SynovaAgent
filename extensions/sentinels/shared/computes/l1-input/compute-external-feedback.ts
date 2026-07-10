/**
 * compute-external-feedback.ts — 企业动作的外部回响 (0.3)
 *
 * 契约ID: COMPUTE-EXTERNAL-FEEDBACK-v1
 * 模块: l1-input/external_feedback
 * 消费边: EXTERNAL_FEEDBACK
 * 输入: competitorAggressiveness(0-1), responseLag(天数), feedbackCompleteness(0-1), maxLag?天数
 * 输出(正常): { value: 回响强度, confidence, evidence[], degraded:false }
 * 输出(降级): { value:0, confidence:'low', degraded:true, warnings:['无竞品数据'] }
 *
 * 算法: aggressiveness × (1 - response_lag/max_lag) × feedback_completeness
 */
export interface ExternalFeedbackInput {
  competitorAggressiveness: number;  // 竞品反应强度(0-1), -1=未配置
  responseLag: number;               // 竞品反应滞后天数
  feedbackCompleteness: number;      // 回响完整度(0-1)
  maxLag?: number;                   // 最大滞后天数, 默认365
}

export function computeExternalFeedback(input: ExternalFeedbackInput) {
  const warnings: string[] = [];
  const { competitorAggressiveness, responseLag, feedbackCompleteness, maxLag = 365 } = input;

  if (competitorAggressiveness < 0) {
    return {
      value: 0, confidence: 'low' as const, evidence: [],
      degraded: true, warnings: ['无竞品数据 — competitorAggressiveness未配置'],
    };
  }

  const clampedAggressiveness = Math.max(0, Math.min(1, competitorAggressiveness));
  const clampedCompleteness = Math.max(0, Math.min(1, feedbackCompleteness));
  const lagRatio = Math.min(1, Math.max(0, responseLag / maxLag));

  const feedbackStrength = clampedAggressiveness * (1 - lagRatio) * clampedCompleteness;
  const value = Math.round(feedbackStrength * 1000) / 1000;
  const confidence = clampedCompleteness > 0.7 ? 'high' as const : 'medium' as const;

  return {
    value,
    confidence,
    evidence: [`aggressiveness: ${clampedAggressiveness}`, `responseLag: ${responseLag}d`, `completeness: ${clampedCompleteness}`],
    degraded: false,
    warnings,
  };
}
