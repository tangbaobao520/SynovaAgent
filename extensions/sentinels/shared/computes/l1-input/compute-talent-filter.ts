/**
 * compute-talent-filter.ts — 设定人才准入门槛 (1.4)
 *
 * @contract COMPUTE-TALENT-FILTER-v1 TalentFilterInput {value,confidence,evidence,degraded,warnings} passRate<0
 * 模块: l1-input/talent_filter
 * 消费边: TALENT_FILTER
 * 输入: selectionThreshold(0-1), passRate(0-1)
 * 输出(正常): { value: 筛选严格度, confidence, evidence[], degraded:false }
 * 输出(降级): { value:0, confidence:'low', degraded:true, warnings:['passRate为0'] }
 *
 * 算法: filter_strictness = selection_threshold × (1 - pass_rate)
 */
export interface TalentFilterInput {
  selectionThreshold: number;  // 准入门槛(0-1)
  passRate: number;            // 通过率(0-1), -1=未配置
  filterCriteria?: string;     // 筛选标准描述
}

export function computeTalentFilter(input: TalentFilterInput) {
  const warnings: string[] = [];
  const { selectionThreshold, passRate } = input;

  if (passRate < 0) {
    return {
      value: 0, confidence: 'low' as const, evidence: [],
      degraded: true, warnings: ['passRate未配置 — 无法计算筛选严格度'],
    };
  }

  const clampedThreshold = Math.max(0, Math.min(1, selectionThreshold));
  const clampedPassRate = Math.max(0, Math.min(1, passRate));

  if (clampedPassRate === 0 && clampedThreshold > 0) {
    return {
      value: 1, confidence: 'high' as const,
      evidence: [`threshold: ${clampedThreshold}`, `passRate: 0`],
      degraded: true,
      warnings: ['passRate为0 — 筛选过于严格，可能无人通过'],
    };
  }

  const strictness = clampedThreshold * (1 - clampedPassRate);
  const value = Math.round(strictness * 1000) / 1000;
  const confidence = value > 0.5 ? 'high' as const : 'medium' as const;

  return {
    value,
    confidence,
    evidence: [`threshold: ${clampedThreshold}`, `passRate: ${clampedPassRate}`],
    degraded: false,
    warnings,
  };
}
