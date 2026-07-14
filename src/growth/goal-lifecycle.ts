/**
 * src/growth/goal-lifecycle.ts — Goal 生命周期管理
 *
 * 封装完整的 7 态状态机 + PolicyEngine 权限检查 + closeGoal 闭环验证。
 *
 * 契约:
 *   @input  — goalId + 目标状态 + actor 信息 + GraphStore + AuditStore + PolicyEngine
 *   @output — void（成功）或 throw Error（失败）
 *   @degraded — AuditStore 不可用时仅 log.warn，不影响主流程
 */
import { createLogger } from '@synova/logger';
import type { Goal, GoalStatus, GoalMetric, GraphBridgeLike, AuditStoreLike, PolicyEngineLike } from './goal-types';
import { getGoal, updateGoalStatus } from './goal-store';
import { registerOnGoalActive, unregisterOnGoalClosed, pauseOnGoalPaused } from './goal-sentinel-lifecycle';
import type { SentinelRegistry } from '../sentinel/types';

const log = createLogger('growth/goal-lifecycle');

// ═══ SOI 定义 ═══

/** Goal 操作对应的 SOI */
const SOI_GOAL_WRITE = 'goal.write';
const SOI_GOAL_ARCHIVE = 'goal.archive';
const SOI_GOAL_CLOSE = 'goal.close';
const SOI_GOAL_ABANDON = 'goal.abandon';

// ═══ 权限辅助 ═══

/**
 * 检查 PolicyEngine 是否允许指定操作。
 * @returns true=允许，false=拒绝（log.warn）
 */
function checkPolicy(
  policy: PolicyEngineLike,
  role: string,
  soi: string,
): boolean {
  const decision = policy.evaluate({ role, dataLevel: 'S1', soi });
  if (!decision.allow) {
    log.warn({ role, soi, denyReason: decision.denyReason }, 'PolicyEngine 拒绝操作');
    return false;
  }
  return true;
}

// ═══ 生命周期函数 ═══

/**
 * 转换 Goal 生命周期状态。
 *
 * 步骤:
 * 1. 调用 goal-store 的 updateGoalStatus（含17条规则校验 + AuditStore 写入）
 * 2. 对特定转换进行 PolicyEngine 权限检查:
 *    - active→abandoned: 需要 GA 权限
 *    - abandoned→archived: 需要 admin 权限
 *
 * @throws Error — 非法转换或权限不足时抛出
 */
export function transitionGoal(
  goalId: string,
  toStatus: GoalStatus,
  actor: { role: string; departmentId?: string },
  store: GraphBridgeLike,
  audit: AuditStoreLike,
  policy: PolicyEngineLike,
  sentinelRegistry?: SentinelRegistry,
): void {
  // 获取当前 Goal 以检查转换
  const goal = getGoal(goalId, store);
  if (!goal) {
    throw new Error(`Goal ${goalId} 不存在`);
  }

  // 特殊转换需要 PolicyEngine 权限
  if (goal.status === 'active' && toStatus === 'abandoned') {
    if (!checkPolicy(policy, actor.role, SOI_GOAL_ABANDON)) {
      throw new Error(`权限不足: ${actor.role} 无法废弃 Goal (需要 GA 权限)`);
    }
  }
  if (toStatus === 'archived') {
    if (!checkPolicy(policy, actor.role, SOI_GOAL_ARCHIVE)) {
      throw new Error(`权限不足: ${actor.role} 无法归档 Goal`);
    }
  }

  // 非特殊转换也需要写入权限
  if (goal.status !== toStatus) {
    if (!checkPolicy(policy, actor.role, SOI_GOAL_WRITE)) {
      throw new Error(`权限不足: ${actor.role} 无法修改 Goal 状态`);
    }
  }

  // 委托给 goal-store 的 updateGoalStatus（含转换规则 + 审计日志）
  updateGoalStatus(goalId, toStatus, store, audit);

  // D73: 方案哨兵生命周期钩子（可选 sentinelRegistry — 不阻断主流程）
  if (sentinelRegistry) {
    try {
      if (toStatus === 'active' && goal.status !== 'active') {
        registerOnGoalActive(goalId, store, sentinelRegistry);
      } else if ((toStatus === 'completed' || toStatus === 'abandoned') && goal.status !== toStatus) {
        unregisterOnGoalClosed(goalId, sentinelRegistry);
      } else if (toStatus === 'paused' && goal.status !== 'paused') {
        pauseOnGoalPaused(goalId, sentinelRegistry);
      }
    } catch {
      log.warn({ goalId, toStatus }, '方案哨兵钩子执行失败 — 不阻断状态转换');
    }
  }
}

/**
 * 闭环 Goal：比对实际指标 vs 目标指标，判断 outcome。
 *
 * 步骤:
 * 1. 比对 actualMetrics vs goal.metrics 的 targetValue
 * 2. 判断 outcome（achieved / partially_achieved / not_achieved）
 * 3. 调用 updateGoalStatus 将状态转为 completed
 * 4. 预留 D76 知识提取接口
 *
 * @param goalId - 要闭环的 Goal ID
 * @param outcome - 达成状态
 * @param actualMetrics - 实际达成的指标值列表
 */
export function closeGoal(
  goalId: string,
  outcome: 'achieved' | 'partially_achieved' | 'not_achieved',
  actualMetrics: GoalMetric[],
  store: GraphBridgeLike,
  audit: AuditStoreLike,
): void {
  const goal = getGoal(goalId, store);
  if (!goal) {
    throw new Error(`Goal ${goalId} 不存在`);
  }

  if (goal.status !== 'active') {
    throw new Error(`只能闭环 active 状态的 Goal（当前: ${goal.status}）`);
  }

  // 1. 比对实际指标 vs 目标指标
  const metricComparisons: Array<{ metricName: string; target: number; actual: number; met: boolean }> = [];
  for (const targetMetric of goal.metrics) {
    const actual = actualMetrics.find(m => m.metricName === targetMetric.metricName);
    const actualValue = actual?.currentValue ?? 0;
    const met = actualValue >= targetMetric.targetValue;
    metricComparisons.push({
      metricName: targetMetric.metricName,
      target: targetMetric.targetValue,
      actual: actualValue,
      met,
    });
  }

  // 2. 记录闭环日志
  log.info({
    goalId,
    outcome,
    metricComparisons,
    actualDurationDays: goal.actualDurationDays,
  }, 'Goal 闭环');

  // 3. 单次 updateGoalStatus（含 extraProps）保证原子性
  const startDate = new Date(goal.createdAt);
  const actualDays = Math.ceil((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24));

  updateGoalStatus(goalId, 'completed', store, audit, 'growth', {
    metrics: actualMetrics,
    actualDurationDays: actualDays,
  });

  // 4. 预留 D76 知识提取接口
  // TODO(D76): extractGoalKnowledge(goal, outcome, metricComparisons)
}

/**
 * 归档 Goal（completed 或 abandoned 后 30 天可归档）。
 *
 * 自动检查:
 * - 只有 completed/abandoned 状态可归档
 * - completed 后未满 30 天的抛出警告但不阻止（允许手动归档）
 *
 * @throws Error — 状态不允许归档时抛出
 */
export function archiveGoal(
  goalId: string,
  store: GraphBridgeLike,
  audit: AuditStoreLike,
): void {
  const goal = getGoal(goalId, store);
  if (!goal) {
    throw new Error(`Goal ${goalId} 不存在`);
  }

  if (goal.status !== 'completed' && goal.status !== 'abandoned') {
    throw new Error(`只有 completed 或 abandoned 状态的 Goal 可归档（当前: ${goal.status}）`);
  }

  // 检查是否完成/废弃已满 30 天
  const lastModified = new Date(goal.lastModifiedAt).getTime();
  const daysSinceModification = Math.ceil((Date.now() - lastModified) / (1000 * 60 * 60 * 24));

  if (daysSinceModification < 30) {
    log.warn({ goalId, daysSinceModification },
      `Goal 归档: 完成/废弃后仅 ${daysSinceModification} 天（建议等待 30 天）`);
    // 仍然允许归档（手动触发），仅警告
  }

  // 转换为 archived 状态
  updateGoalStatus(goalId, 'archived', store, audit);
}
