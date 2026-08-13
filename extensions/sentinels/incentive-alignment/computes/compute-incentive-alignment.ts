/**
 * incentive-alignment/computes/compute-incentive-alignment.ts — 激励增长对齐度
 *
 * 评估组织激励体系与增长目标的对齐程度。
 * 基于代理理论（Jensen & Meckling 1976）：激励结构应引导代理人做出符合委托人长期利益的决策。
 *
 * 输入: Goal 节点（增长/创新/长期 vs 短期/运营）+ Event 节点（奖励/考核事件类型）
 * 输出: 对齐度评分（0-1），越高越好
 */
export interface AlignmentResult {
  score: number;                  // 0-1, 越高越对齐
  growthGoalRatio: number;       // 增长/创新目标占全部目标比例
  shortTermIncentiveRatio: number; // 短期激励事件占全部事件比例
  assessment: 'aligned' | 'partially' | 'misaligned' | 'insufficient';
  degraded: boolean;
}

export interface GoalData {
  goalType?: string;
}

export interface EventData {
  eventType?: string;
}

export function computeIncentiveAlignment(
  goals: GoalData[],
  events: EventData[]
): AlignmentResult {
  if (goals.length === 0 && events.length === 0) {
    return { score: 0.5, growthGoalRatio: 0, shortTermIncentiveRatio: 0, assessment: 'insufficient', degraded: true };
  }

  // 统计增长/创新目标
  const growthGoals = goals.filter(g => {
    const type = (g.goalType || '').toLowerCase();
    return type.includes('innovation') || type.includes('growth') || type.includes('strategic') || type.includes('long');
  });

  // 统计短期激励事件（成本削减、季度考核、短期KPI）
  const shortTermEvents = events.filter(e => {
    const type = (e.eventType || '').toLowerCase();
    return type.includes('cost_cut') || type.includes('quarterly') || type.includes('short') || type.includes('kpi');
  });

  // 统计长期/增长激励事件
  const growthEvents = events.filter(e => {
    const type = (e.eventType || '').toLowerCase();
    return type.includes('growth') || type.includes('innovation') || type.includes('long_term') || type.includes('equity');
  });

  const totalGoals = goals.length || 1;
  const totalEvents = events.length || 1;

  const growthGoalRatio = growthGoals.length / totalGoals;
  const shortTermIncentiveRatio = shortTermEvents.length / Math.max(totalEvents, 1);
  const growthIncentiveRatio = growthEvents.length / Math.max(totalEvents, 1);

  // 对齐度 = 增长目标比例 × 增长激励比例 - 短期激励比例（负向）
  // 确保在 0-1 范围内
  const rawScore = growthGoalRatio * (1 - shortTermIncentiveRatio) + growthIncentiveRatio * 0.3;
  const score = Math.min(Math.max(rawScore, 0), 1);

  // 评估
  let assessment: 'aligned' | 'partially' | 'misaligned' | 'insufficient';
  if (goals.length === 0) {
    assessment = 'insufficient';
  } else if (score > 0.6) {
    assessment = 'aligned';
  } else if (score > 0.3) {
    assessment = 'partially';
  } else {
    assessment = 'misaligned';
  }

  return {
    score: Math.round(score * 100) / 100,
    growthGoalRatio: Math.round(growthGoalRatio * 100) / 100,
    shortTermIncentiveRatio: Math.round(shortTermIncentiveRatio * 100) / 100,
    assessment,
    degraded: false,
  };
}
