/**
 * diagnosis/hacd.ts — 人机协作深度 (Human-Agent Collaboration Depth)
 *
 * 评估团队中人类与 AI Agent 的协作深度，从完全人工(L0)到完全自主(L4)。
 * 纯计算模块：消费已有 collaboration-collector 事件数据。
 *
 * 无需新数据源。所有计算基于已有统计数据。
 */

import type { HACDReport } from './types';
import { getAllStats, getRecentEvents } from '../collaboration-collector';

// ====================================================================
// Public API
// ====================================================================

/**
 * Compute Human-Agent Collaboration Depth for a team.
 * Pure computation — consumes existing collaboration event data.
 * Returns null if no collaboration events exist.
 */
export function computeHACD(teamId: string): HACDReport | null {
  const stats = getAllStats();
  const allDimensions = Object.values(stats);
  if (allDimensions.length === 0) return null;

  // Aggregate across all dimensions
  let totalEvents = 0;
  let totalInterventions = 0;
  let totalEscalated = 0;
  let totalResolved = 0;
  let totalDeadlocked = 0;
  let totalDurationMs = 0;

  for (const dim of allDimensions) {
    totalEvents += dim.totalEvents;
    totalInterventions += dim.humanInterventions;
    totalEscalated += dim.outcomes.escalated;
    totalResolved += dim.outcomes.resolved;
    totalDeadlocked += dim.outcomes.deadlocked;
    totalDurationMs += dim.totalDurationMs;
  }

  if (totalEvents === 0) return null;

  const hitlRatio = totalInterventions / totalEvents;
  const autoRatio = totalResolved / Math.max(totalEvents, 1);
  const escalationRate = totalEscalated / Math.max(totalEvents, 1);
  const deadlockRate = totalDeadlocked / Math.max(totalEvents, 1);

  // Determine HACD level
  let level: HACDReport['level'];
  if (autoRatio >= 0.9 && escalationRate < 0.05) level = 'L4';
  else if (autoRatio >= 0.7 && escalationRate < 0.1) level = 'L3';
  else if (autoRatio >= 0.4 && hitlRatio < 0.4) level = 'L2';
  else if (hitlRatio >= 0.4 && autoRatio >= 0.2) level = 'L1';
  else level = 'L0';

  // Trend: check recent events vs overall
  const recentEvents = getRecentEvents(50);
  const recentInterventions = recentEvents.filter(e => e.data.humanIntervention).length;
  const recentRatio = recentEvents.length > 0
    ? recentInterventions / recentEvents.length
    : hitlRatio;

  let trend: HACDReport['trend'];
  const diff = hitlRatio - recentRatio;
  if (Math.abs(diff) < 0.05) trend = 'stable';
  else if (diff > 0) trend = 'improving'; // HITL ratio decreasing
  else trend = 'declining';

  const levelLabel: Record<string, string> = {
    L0: '完全人工——几乎所有决策需要人类介入',
    L1: '辅助协作——Agent 提供建议，人类做最终决策',
    L2: '协作共生——人类与 Agent 各担一半决策',
    L3: '高度自主——Agent 自主处理大多数任务，人类处理例外',
    L4: '完全自主——Agent 独立运转，人类仅设定目标',
  };

  return {
    level,
    hitlRatio: Math.round(hitlRatio * 100) / 100,
    autoRatio: Math.round(autoRatio * 100) / 100,
    trend,
    interpretation: `人机协作深度为${level}级别（${levelLabel[level]}）。` +
      `人工介入率${(hitlRatio * 100).toFixed(0)}%，自主完成率${(autoRatio * 100).toFixed(0)}%。` +
      (trend === 'improving' ? '近期自主性呈上升趋势。' :
       trend === 'declining' ? '近期人工介入增多，建议关注。' :
       '趋势稳定。'),
  };
}
