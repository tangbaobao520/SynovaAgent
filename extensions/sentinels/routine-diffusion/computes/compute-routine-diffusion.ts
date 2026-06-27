/**
 * routine-diffusion/computes/compute-routine-diffusion.ts — 惯例扩散速度
 *
 * 评估新惯例（流程/实践）在组织内的扩散速度。
 * 基于 Process 节点在不同团队间的采用比例。
 * 采用率越高 = 扩散速度越快。
 */
export interface DiffusionResult {
  score: number;
  totalProcesses: number;
  processesPerTeam: number;
  adoptionRatio: number;
  assessment: 'fast' | 'moderate' | 'slow' | 'insufficient';
  degraded: boolean;
}

export function computeRoutineDiffusion(
  processCount: number,
  teamCount: number
): DiffusionResult {
  if (processCount === 0 && teamCount === 0) {
    return { score: 0.5, totalProcesses: 0, processesPerTeam: 0, adoptionRatio: 0, assessment: 'insufficient', degraded: true };
  }

  if (teamCount === 0) {
    return { score: 0.3, totalProcesses: processCount, processesPerTeam: 0, adoptionRatio: 0, assessment: 'slow', degraded: false };
  }

  // 人均流程数 = 流程总数 / 团队数
  const processesPerTeam = processCount / teamCount;

  // 采纳率 = min(人均流程数 / 3, 1) — 假设每个团队应至少拥有 3 个共享流程
  const adoptionRatio = Math.min(processesPerTeam / 3, 1);

  // 扩散速度综合考虑采纳率和流程丰富度
  const richnessScore = Math.min(processCount / 10, 1);
  const score = Math.round((0.6 * adoptionRatio + 0.4 * richnessScore) * 100) / 100;

  let assessment: 'fast' | 'moderate' | 'slow' | 'insufficient';
  if (score > 0.6) {
    assessment = 'fast';
  } else if (score > 0.3) {
    assessment = 'moderate';
  } else {
    assessment = 'slow';
  }

  return { score, totalProcesses: processCount, processesPerTeam: Math.round(processesPerTeam * 10) / 10, adoptionRatio: Math.round(adoptionRatio * 100) / 100, assessment, degraded: false };
}
