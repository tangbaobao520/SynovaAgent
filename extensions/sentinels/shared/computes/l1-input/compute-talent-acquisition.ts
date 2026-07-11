/**
 * compute-talent-acquisition.ts — 获取人力 (1.3)
 *
 * @contract COMPUTE-TALENT-ACQUISITION-v1 TalentAcquisitionInput {value,confidence,evidence,degraded,warnings} hiresCount<0||avgQualityScore<0
 * 模块: l1-input/talent_acquisition
 * 消费边: TALENT_ACQUISITION
 * 输入: hiresCount(number), avgQualityScore(0-1), selectionThreshold(0-1)
 * 输出(正常): { value: 人才获取效率, confidence, evidence[], degraded:false }
 * 输出(降级): { value:0, confidence:'low', degraded:true, warnings:['无招聘数据'] }
 *
 * 算法: hire_effectiveness = (hires_ratio × quality) × selection_strictness
 */
export interface TalentAcquisitionInput {
  hiresCount: number;           // 招聘人数
  avgQualityScore: number;      // 平均质量评分(0-1), -1=未配置
  selectionThreshold: number;   // 准入门槛(0-1)
}

export function computeTalentAcquisition(input: TalentAcquisitionInput) {
  const warnings: string[] = [];
  const { hiresCount, avgQualityScore, selectionThreshold } = input;

  if (hiresCount < 0 || avgQualityScore < 0) {
    return {
      value: 0, confidence: 'low' as const, evidence: [],
      degraded: true, warnings: ['无招聘数据 — hiresCount或avgQualityScore未配置'],
    };
  }

  const clampedQuality = Math.max(0, Math.min(1, avgQualityScore));
  const clampedThreshold = Math.max(0.01, Math.min(1, selectionThreshold));

  const hiresRatio = Math.min(1, hiresCount / 100); // 归一化: 100为饱和值
  const effectiveness = (hiresRatio * clampedQuality) * (1 / clampedThreshold);
  const normalized = Math.min(1, effectiveness);
  const value = Math.round(normalized * 1000) / 1000;
  const confidence = clampedQuality > 0.7 ? 'high' as const : 'medium' as const;

  return {
    value,
    confidence,
    evidence: [`hiresCount: ${hiresCount}`, `quality: ${clampedQuality}`, `threshold: ${clampedThreshold}`],
    degraded: false,
    warnings,
  };
}
