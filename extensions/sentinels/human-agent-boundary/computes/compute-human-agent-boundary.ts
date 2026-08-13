/**
 * T9: 人 + Agent 混合边界效率
 *
 * 理论依据: 人机协同效率 = 自动化率 x 交接准确度 x 吞吐变化。
 * 最优边界 = 人类做判断和创造，Agent 做执行和重复。
 *
 * 评分方法:
 * - automatedPct: 自动处理的任务比例
 * - handoffAccuracy: 人机交接准确率
 * - throughputChange: 引入 Agent 后的吞吐变化率
 * - satisfaction: 员工满意度 [0,1]
 */
export interface HybridEfficiencyResult {
  score: number;
  automatedPct: number;
  handoffAccuracy: number;
  throughputChange: number;
  satisfaction: number;
  degraded: boolean;
}

export function computeHumanAgentBoundary(params: {
  automatedTasks: number;
  totalTasks: number;
  successfulHandoffs: number;
  totalHandoffs: number;
  preAgentThroughput: number;
  postAgentThroughput: number;
  satisfactionScore: number;
}): HybridEfficiencyResult {
  const { automatedTasks, totalTasks, successfulHandoffs, totalHandoffs, preAgentThroughput, postAgentThroughput, satisfactionScore } = params;
  if (totalTasks === 0) return { score: 0.5, automatedPct: 0, handoffAccuracy: 0, throughputChange: 0, satisfaction: 0, degraded: true };
  const automatedPct = totalTasks > 0 ? automatedTasks / totalTasks : 0;
  const handoffAccuracy = totalHandoffs > 0 ? successfulHandoffs / totalHandoffs : 0.5;
  const throughputChange = preAgentThroughput > 0 ? (postAgentThroughput - preAgentThroughput) / preAgentThroughput : 0;
  const throughputScore = Math.min(Math.max(throughputChange, -1) + 1, 1);
  const satisfaction = Math.min(satisfactionScore, 1);
  return {
    score: Math.round((0.3 * automatedPct + 0.25 * handoffAccuracy + 0.25 * throughputScore + 0.2 * satisfaction) * 100) / 100,
    automatedPct: Math.round(automatedPct * 100) / 100,
    handoffAccuracy: Math.round(handoffAccuracy * 100) / 100,
    throughputChange: Math.round(throughputChange * 100) / 100,
    satisfaction: Math.round(satisfaction * 100) / 100,
    degraded: false,
  };
}
