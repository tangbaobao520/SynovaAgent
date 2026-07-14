/**
 * src/growth/next-action-engine.ts — NextAction 推荐引擎 (D74)
 *
 * 决策树生成推荐的下一步行动，基于工作台当前状态。
 *
 * 契约:
 *   @input  — DepartmentWorkspace（含 activeGoals/recentAlerts/pendingProposals）
 *   @output — NextAction | null
 *   @degraded — 无异常路径，纯同步函数
 */
import type { DepartmentWorkspace, NextAction } from './workspace-types';

/**
 * 计算推荐的下一步行动。
 *
 * 决策树（优先级从高到低）:
 *   1. 存在 critical 偏离的 Goal → review_critical_goal
 *   2. 存在即将过期（< 2 天）的 pending Proposal → confirm_proposal
 *   3. 存在未消除的告警 → handle_alert
 *   4. 全部 on_track → review_dashboard
 *   5. 无活跃数据 → null
 *
 * @param workspace — 部门工作台全量数据
 * @returns 推荐的下一步行动，无数据时返回 null
 */
export function computeNextAction(workspace: DepartmentWorkspace): NextAction | null {
  // 1. 检查 critical 偏离的 Goal
  const criticalGoal = workspace.activeGoals.find(
    (g) => g.deviationStatus === 'critical',
  );
  if (criticalGoal) {
    return {
      actionType: 'review_critical_goal',
      description: `Goal "${criticalGoal.title}" 出现严重偏离，建议立即审查`,
      priority: 'P0',
      targetGoalId: criticalGoal.goalId,
      reason: `三因子偏离检测 — Goal ${criticalGoal.goalId} 连续偏离超过阈值`,
    };
  }

  // 2. 检查即将过期的 Proposal（< 2 天）
  const now = Date.now();
  const twoDays = 2 * 24 * 60 * 60 * 1000;
  const expiringProposal = workspace.pendingProposals.find((p) => {
    if (!p.expiresAt) return false;
    const expiresMs = new Date(p.expiresAt).getTime();
    return expiresMs - now > 0 && expiresMs - now < twoDays;
  });
  if (expiringProposal) {
    return {
      actionType: 'confirm_proposal',
      description: `Proposal "${expiringProposal.title}" 即将过期，请尽快确认`,
      priority: 'P1',
      reason: `Proposal ${expiringProposal.proposalId} 将在 ${expiringProposal.expiresAt} 过期`,
    };
  }

  // 3. 检查未消除告警
  const undismissedAlert = workspace.recentAlerts.find((a) => !a.dismissed);
  if (undismissedAlert) {
    return {
      actionType: 'handle_alert',
      description: `有未处理的告警: ${undismissedAlert.message}`,
      priority: undismissedAlert.severity === 'critical' ? 'P0' : 'P1',
      reason: `告警 ${undismissedAlert.alertId} 尚未处理`,
    };
  }

  // 4. 全部正常
  if (workspace.activeGoals.length > 0) {
    return {
      actionType: 'review_dashboard',
      description: '所有 Goal 正常推进，建议查看工作台全景',
      priority: 'P2',
      reason: `全部 ${workspace.activeGoals.length} 个活跃 Goal 状态正常`,
    };
  }

  // 5. 无活跃数据
  return null;
}
