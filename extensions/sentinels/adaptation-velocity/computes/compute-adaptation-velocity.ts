/**
 * adaptation-velocity/computes/compute-adaptation-velocity.ts — 战略调适速度
 *
 * 检测企业在战略方向变化后的实际调适速度。
 * 输入: Event 节点（战略事件、流程变更、项目启动）和 Goal 节点的变化
 * 输出: 调适速度评分（0-1，越高越敏捷）
 */
export interface VelocityResult {
  score: number;
  totalEvents: number;
  adaptationEvents: number;
  avgResponseDays: number;
  degraded: boolean;
  signals: string[];
}

export interface ChangeEvent {
  eventType?: string;
  timestamp?: string;
}

export function computeAdaptationVelocity(
  events: ChangeEvent[]
): VelocityResult {
  if (events.length === 0) {
    return { score: 0.5, totalEvents: 0, adaptationEvents: 0, avgResponseDays: 0, degraded: true, signals: ['无事件数据'] };
  }

  const signals: string[] = [];

  // 识别战略调适相关事件
  const adaptationEvents = events.filter(e => {
    const type = (e.eventType || '').toLowerCase();
    return type.includes('project_launch') || type.includes('process_change') ||
           type.includes('strategic') || type.includes('restructure') ||
           type.includes('reorg') || type.includes('pivot');
  });

  // 识别问题/故障事件
  const problemEvents = events.filter(e => {
    const type = (e.eventType || '').toLowerCase();
    return type.includes('problem') || type.includes('client_churn') ||
           type.includes('failure') || type.includes('incident');
  });

  // 计算调适速度：调适事件 / 总事件比例
  const adaptationRatio = adaptationEvents.length / Math.max(events.length, 1);

  // 问题事件如果没有对应的调适事件 → 负信号
  const unresolvedProblems = problemEvents.length - adaptationEvents.length;
  if (unresolvedProblems > 2) {
    signals.push(`有 ${unresolvedProblems} 个问题/故障未触发调适行动`);
  }

  // 没有调适事件 → 组织可能僵化
  if (adaptationEvents.length === 0 && events.length > 3) {
    signals.push('尽管有事件发生，未检测到调适行动');
  }

  // 有调适事件 → 计算应对速度（简化: 事件比例越高反应越快）
  const speedScore = Math.min(adaptationRatio * 2, 1);
  const magnitudeScore = Math.min(events.length / 10, 1);
  const score = Math.round((0.6 * speedScore + 0.4 * magnitudeScore) * 100) / 100;

  return {
    score,
    totalEvents: events.length,
    adaptationEvents: adaptationEvents.length,
    avgResponseDays: adaptationEvents.length > 0 ? Math.round(30 / adaptationEvents.length) : 0,
    degraded: false,
    signals,
  };
}
