/**
 * strategy-capability-fit/computes/compute-strategy-capability-fit.ts — 战略-能力一致性
 *
 * 读取 Goal 节点（战略目标）和 Capability 节点（现有能力），
 * 评估战略目标与现有能力之间的匹配度。
 * 输入: Goal 节点和 Capability 节点
 * 输出: 一致性评分（0-1），差距列表
 */
export interface FitResult {
  score: number;
  alignmentGaps: string[];
  strategicGoals: number;
  coreCapabilities: number;
  degraded: boolean;
}

export interface GoalNode {
  name: string;
  goalType?: string;
}

export interface CapNode {
  name: string;
  category?: string;
  level?: number;
}

export function computeStrategyCapabilityFit(
  goals: GoalNode[],
  capabilities: CapNode[]
): FitResult {
  if (goals.length === 0 && capabilities.length === 0) {
    return { score: 0.5, alignmentGaps: ['无数据'], strategicGoals: 0, coreCapabilities: 0, degraded: true };
  }

  const alignmentGaps: string[] = [];
  const innovationGoals = goals.filter(g => g.goalType === 'innovation').length;
  const strategicGoals = goals.filter(g => g.goalType === 'strategic').length;
  const totalStrategic = innovationGoals + strategicGoals;
  const coreCaps = capabilities.filter(c => c.category === 'core_competence').length;
  const totalCaps = capabilities.length;

  if (totalStrategic > 0 && coreCaps === 0) {
    alignmentGaps.push(`有 ${totalStrategic} 个战略/创新目标，但无核心能力支撑`);
  }
  if (coreCaps > 0 && totalStrategic === 0 && goals.length > 0) {
    alignmentGaps.push(`有 ${coreCaps} 个核心能力，但无战略/创新目标引导`);
  }
  if (totalStrategic === 0 && goals.length > 0) {
    alignmentGaps.push('目标均为运营/优化类，缺少战略或创新目标');
  }

  const capCoverage = totalCaps > 0 ? Math.min(coreCaps / Math.max(totalCaps * 0.3, 1), 1) : 0.5;
  const goalCoverage = goals.length > 0 ? Math.min(totalStrategic / Math.max(goals.length * 0.3, 1), 1) : 0.5;
  const avgLevel = capabilities.length > 0
    ? capabilities.reduce((s, c) => s + (c.level || 2), 0) / capabilities.length / 5
    : 0.5;

  const score = Math.round((0.4 * capCoverage + 0.4 * goalCoverage + 0.2 * avgLevel) * 100) / 100;
  return { score: Math.min(Math.max(score, 0), 1), alignmentGaps, strategicGoals: totalStrategic, coreCapabilities: coreCaps, degraded: false };
}
