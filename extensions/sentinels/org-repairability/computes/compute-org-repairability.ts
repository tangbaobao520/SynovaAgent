/**
 * org-repairability/computes/compute-org-repairability.ts — 组织修复能力
 *
 * 评估组织检测和修复问题的能力。
 * 基于: 问题发现率、修复率、平均修复时间。
 * 修复能力是组织韧性的核心指标。
 */
export interface RepairabilityResult {
  score: number;               // 0-1, 修复能力评分
  problemCount: number;        // 发现问题总数
  repairedCount: number;       // 已修复问题数
  repairRate: number;          // 修复率
  assessment: 'strong' | 'moderate' | 'weak' | 'insufficient';
  degraded: boolean;
}

export function computeOrgRepairability(
  eventCount: number,
  resolvedCount: number
): RepairabilityResult {
  if (eventCount === 0 && resolvedCount === 0) {
    return { score: 0.5, problemCount: 0, repairedCount: 0, repairRate: 0, assessment: 'insufficient', degraded: true };
  }

  const problemCount = eventCount;
  const repairedCount = Math.min(resolvedCount, problemCount);
  const repairRate = problemCount > 0 ? repairedCount / problemCount : 0;

  // 修复能力评分:
  // 修复率 > 80% = 强
  // 修复率 50-80% = 中等
  // 修复率 < 50% = 弱
  const score = Math.round(repairRate * 100) / 100;

  let assessment: 'strong' | 'moderate' | 'weak' | 'insufficient';
  if (repairRate > 0.8) {
    assessment = 'strong';
  } else if (repairRate > 0.5) {
    assessment = 'moderate';
  } else {
    assessment = 'weak';
  }

  return { score, problemCount, repairedCount, repairRate: Math.round(repairRate * 100) / 100, assessment, degraded: false };
}
