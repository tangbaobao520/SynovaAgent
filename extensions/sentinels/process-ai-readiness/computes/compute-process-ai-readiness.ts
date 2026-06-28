/**
 * T5: 流程 AI 化就绪度
 *
 * 理论依据: 企业流程数字化成熟度决定了 AI 落地的速度和深度。
 * 三维评估: 数据就绪度 + 流程数字化度 + 团队就绪度。
 *
 * 评分方法:
 * - dataReadiness: 结构化数据覆盖率 [0,1]
 * - processDigitalization: 已数字化的流程比例 [0,1]
 * - teamReadiness: 团队 AI 技能平均分 [0,1]
 * - score = 0.4 x data + 0.35 x process + 0.25 x team
 */
export interface AiReadinessResult {
  score: number;
  dataReadiness: number;
  processDigitalization: number;
  teamReadiness: number;
  degraded: boolean;
}

export function computeProcessAiReadiness(params: {
  structuredDataRatio: number;
  digitizedProcesses: number;
  totalProcesses: number;
  teamSkillAvg: number;
}): AiReadinessResult {
  const { structuredDataRatio, digitizedProcesses, totalProcesses, teamSkillAvg } = params;
  if (totalProcesses === 0) return { score: 0.5, dataReadiness: 0, processDigitalization: 0, teamReadiness: 0, degraded: true };
  const dataReadiness = Math.min(structuredDataRatio, 1);
  const processDigitalization = Math.min(digitizedProcesses / totalProcesses, 1);
  const teamReadiness = Math.min(teamSkillAvg / 5, 1);
  return {
    score: Math.round((0.4 * dataReadiness + 0.35 * processDigitalization + 0.25 * teamReadiness) * 100) / 100,
    dataReadiness: Math.round(dataReadiness * 100) / 100,
    processDigitalization: Math.round(processDigitalization * 100) / 100,
    teamReadiness: Math.round(teamReadiness * 100) / 100,
    degraded: false,
  };
}
