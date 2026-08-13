/**
 * routine-mutation/computes/compute-routine-mutation.ts — 惯例变异率
 *
 * 基于演化经济学（Nelson & Winter 1982），评估组织惯例（routine）的变异频率。
 * 惯例 = 稳定的重复行为模式（Process/Team/Tool 节点）。
 * 变异 = 惯例被修改、替换或淘汰。
 *
 * 输入: Process 节点（含 lastUpdated/version），Event 节点（含 process_change 类型）
 * 输出: 变异率（0-1），过低=僵化，过高=不稳定
 */
export interface MutationResult {
  mutationRate: number;          // 0-1, 发生变异的惯例比例
  totalRoutines: number;
  mutatedRoutines: number;
  assessment: 'frozen' | 'healthy' | 'unstable' | 'insufficient_data';
  degraded: boolean;
}

export interface RoutineNode {
  id: string;
  updated?: boolean;     // 是否在过去12个月被修改过
  hasChanges?: boolean;  // 是否有相关的变更事件
}

export interface ChangeEvent {
  eventType: string;
}

export function computeRoutineMutation(
  routines: RoutineNode[],
  changes: ChangeEvent[]
): MutationResult {
  if (routines.length === 0) {
    return { mutationRate: 0, totalRoutines: 0, mutatedRoutines: 0, assessment: 'insufficient_data', degraded: true };
  }

  // 计算被修改过的惯例数量
  const mutatedRoutines = routines.filter(r => r.updated === true || r.hasChanges === true).length;

  // 加上变革事件数量
  const processChanges = changes.filter(c => {
    const type = (c.eventType || '').toLowerCase();
    return type.includes('process_change') || type.includes('project_launch');
  }).length;

  const mutationRate = routines.length > 0
    ? Math.min((mutatedRoutines + processChanges) / Math.max(routines.length, 1), 1)
    : 0;

  // 评估: 过低=僵化(<10%), 健康(10-40%), 不稳定(>40%)
  let assessment: 'frozen' | 'healthy' | 'unstable' | 'insufficient_data';
  if (mutationRate < 0.1) {
    assessment = 'frozen';
  } else if (mutationRate > 0.4) {
    assessment = 'unstable';
  } else {
    assessment = 'healthy';
  }

  return {
    mutationRate: Math.round(mutationRate * 100) / 100,
    totalRoutines: routines.length,
    mutatedRoutines,
    assessment,
    degraded: false,
  };
}
