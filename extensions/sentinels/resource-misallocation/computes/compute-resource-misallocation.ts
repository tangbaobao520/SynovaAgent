/**
 * resource-misallocation/computes/compute-resource-misallocation.ts — 资源错配指数
 *
 * 对比战略优先级与实际资源分配。
 * 输入: Goal 节点(战略领域+优先级) + Person 节点(实际投入+技能) + FINANCIAL 节点(预算)
 * 输出: 错配指数(0-1, 越高越错配)
 */
export interface MisallocationResult {
  index: number;
  totalGoals: number;
  underfundedGoals: string[];
  overstaffedAreas: string[];
  degraded: boolean;
}

export interface StrategicGoal {
  name: string;
  priority?: number;   // 1-5
  area?: string;
}

export interface ResourceAllocation {
  goalArea: string;
  headcount: number;
  budget: number;
}

export function computeResourceMisallocation(
  goals: StrategicGoal[],
  resources: ResourceAllocation[]
): MisallocationResult {
  if (goals.length === 0 && resources.length === 0) {
    return { index: 0.5, totalGoals: 0, underfundedGoals: [], overstaffedAreas: [], degraded: true };
  }

  if (goals.length === 0 || resources.length === 0) {
    return { index: 0.3, totalGoals: goals.length, underfundedGoals: [], overstaffedAreas: [], degraded: false };
  }

  const underfundedGoals: string[] = [];
  const overstaffedAreas: string[] = [];

  // 对每个高优先级目标，检查是否有对应的资源分配
  const highPriorityGoals = goals.filter(g => (g.priority || 3) >= 4);
  for (const goal of highPriorityGoals) {
    const matchedResources = resources.filter(r =>
      goal.area ? r.goalArea.includes(goal.area) || goal.area.includes(r.goalArea) : true
    );
    if (matchedResources.length === 0) {
      underfundedGoals.push(goal.name || '未命名目标');
    }
  }

  // 对每个资源分配，检查是否有对应的战略目标
  for (const res of resources) {
    const matchedGoals = goals.filter(g =>
      g.area ? res.goalArea.includes(g.area) || g.area.includes(res.goalArea) : true
    );
    if (matchedGoals.length === 0 && res.headcount > 5) {
      overstaffedAreas.push(res.goalArea);
    }
  }

  // 错配指数 = 无资源支撑的高优目标比例 + 无目标支撑的资源比例
  const goalMisalign = goals.length > 0 ? underfundedGoals.length / Math.max(highPriorityGoals.length, 1) : 0;
  const resMisalign = resources.length > 0 ? overstaffedAreas.length / Math.max(resources.length, 1) : 0;
  const index = Math.round(Math.min((0.6 * goalMisalign + 0.4 * resMisalign), 1) * 100) / 100;

  return { index, totalGoals: goals.length, underfundedGoals, overstaffedAreas, degraded: false };
}
