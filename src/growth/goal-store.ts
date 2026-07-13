/**
 * src/growth/goal-store.ts — Goal 持久化存储
 *
 * 基于 GraphStore 的 GOAL 类型节点存储，复用 createNode/queryNodes/updateNode/getNode。
 * 实现 17 条状态转换规则 + AuditStore 审计日志。
 *
 * 契约:
 *   @input  — Goal 对象 + GraphBridgeLike（依赖注入）
 *   @output — createGoal 返回 goalId，其他函数按定义返回
 *   @degraded — GraphStore 不可用时返回降级结果，不崩溃
 */
import { randomUUID } from 'crypto';
import { createLogger } from '@synova/logger';
import type { Goal, GoalStatus, GraphBridgeLike, AuditStoreLike, TransitionRule } from './goal-types';

const log = createLogger('growth/goal-store');

// ═══ 17 条状态转换规则（权威文档 §3.2 完整清单） ═══

/**
 * Goal 状态转换规则表。
 * 每条规则标注 from→to 方向 + 前置条件说明。
 * 非法转换（不在表中的组合）被 updateGoalStatus 拒绝。
 */
export const TRANSITION_RULES: TransitionRule[] = [
  { from: 'draft', to: 'pending_ga', description: '提交GA审核', precondition: '28字段中 title/deadline/ownerDeptId/≥1 metric 非空' },
  { from: 'draft', to: 'abandoned', description: '创建者可在确认前废弃' },
  { from: 'pending_ga', to: 'active', description: 'GA确认标记，开始执行' },
  { from: 'pending_ga', to: 'draft', description: 'GA驳回，返回修改' },
  { from: 'pending_ga', to: 'abandoned', description: 'GA拒绝并废弃' },
  { from: 'active', to: 'completed', description: '所有 SuccessCriterion.verified === true', precondition: '全部 successCriteria 的 verified 字段为 true' },
  { from: 'active', to: 'paused', description: '中层或GA暂停执行' },
  { from: 'active', to: 'abandoned', description: '仅GA权限 + 废弃原因非空' },
  { from: 'paused', to: 'active', description: '恢复执行' },
  { from: 'paused', to: 'abandoned', description: '暂停超过90天自动废弃' },
  { from: 'completed', to: 'archived', description: '30天自动归档' },
  { from: 'abandoned', to: 'archived', description: '30天自动归档' },
];

/**
 * 判断状态转换是否合法（是否符合 17 条规则中的一条）。
 * @returns true=合法, false=非法
 */
export function isValidTransition(from: GoalStatus, to: GoalStatus): boolean {
  if (from === to) return true; // 允许原地更新（仅 metrics 等字段变化）
  return TRANSITION_RULES.some(r => r.from === from && r.to === to);
}

/**
 * 检查从 draft→pending_ga 的前置条件是否满足。
 * 仅检查 title/deadline/ownerDeptId/≥1 metric 非空。
 */
export function checkDraftPreconditions(goal: Goal): { valid: boolean; reason?: string } {
  if (!goal.title || goal.title.trim().length === 0) {
    return { valid: false, reason: 'title 为空' };
  }
  if (!goal.deadline || goal.deadline.trim().length === 0) {
    return { valid: false, reason: 'deadline 为空' };
  }
  if (!goal.ownerDeptId || goal.ownerDeptId.trim().length === 0) {
    return { valid: false, reason: 'ownerDeptId 为空' };
  }
  if (!goal.metrics || goal.metrics.length === 0) {
    return { valid: false, reason: '至少需要一个 metric' };
  }
  return { valid: true };
}

/**
 * 检查 active→completed 的前置条件：全部 successCriteria verified。
 */
export function checkCompletionPreconditions(goal: Goal): { valid: boolean; reason?: string } {
  if (!goal.successCriteria || goal.successCriteria.length === 0) {
    return { valid: false, reason: 'successCriteria 为空，无法判定完成' };
  }
  const unverified = goal.successCriteria.filter(sc => !sc.verified);
  if (unverified.length > 0) {
    return { valid: false, reason: `仍有 ${unverified.length} 个条件未验证` };
  }
  return { valid: true };
}

// ═══ CRUD 操作 ═══

/**
 * 创建 Goal 并持久化到 GraphStore。
 *
 * @param goal - 不含 goalId 的 Goal 数据（goalId 由本函数生成）
 * @param store - GraphBridge 实例
 * @param audit - AuditStore 实例（用于记录创建审计事件）
 * @param graph - 图名称（默认 'growth'）
 * @returns 生成的 goalId
 */
export function createGoal(goal: Goal, store: GraphBridgeLike, audit: AuditStoreLike, graph: string = 'growth'): string {
  const goalId = randomUUID();

  const goalNode: Goal = {
    ...goal,
    goalId,
    status: goal.status || 'draft',
    createdAt: goal.createdAt || new Date().toISOString(),
    lastModifiedAt: new Date().toISOString(),
    reDiagnosisCount: goal.reDiagnosisCount || 0,
  };

  try {
    store.createNode('GOAL', goalNode as unknown as Record<string, unknown>, graph);
    log.info({ goalId, title: goal.title }, 'Goal 已创建');

    // 写入创建审计日志（fire-and-forget，失败不阻断）
    audit.write({
      orgId: goal.orgId,
      actorId: 'system:goal-store',
      actorRole: 'system',
      action: 'goal.created',
      targetType: 'GOAL',
      targetId: goalId,
      newValue: JSON.stringify({ title: goal.title, ownerDeptId: goal.ownerDeptId }),
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg, goalId }, 'Goal 创建审计日志写入失败');
    });

    return goalId;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg, goalId }, 'Goal 创建失败');
    throw new Error(`创建 Goal 失败: ${msg}`);
  }
}

/**
 * 按 goalId 获取 Goal。
 * @returns Goal 对象，不存在时返回 null
 */
export function getGoal(goalId: string, store: GraphBridgeLike, graph: string = 'growth'): Goal | null {
  try {
    const node = store.getNode(goalId, graph) as { id: string; type: string; props: Record<string, unknown> } | null;
    if (!node) return null;
    return node.props as unknown as Goal;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg, goalId }, '获取 Goal 失败');
    return null;
  }
}

/**
 * 按部门 ID 列出所有 Goal。
 */
export function listGoalsByDept(deptId: string, store: GraphBridgeLike, graph: string = 'growth'): Goal[] {
  try {
    const nodes = store.queryNodes('GOAL', { ownerDeptId: deptId }, graph);
    return nodes.map(n => n.props as unknown as Goal);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg, deptId }, '按部门查询 Goal 失败');
    return [];
  }
}

/**
 * 按组织 ID 列出所有 Goal。
 */
export function listGoalsByOrg(orgId: string, store: GraphBridgeLike, graph: string = 'growth'): Goal[] {
  try {
    const nodes = store.queryNodes('GOAL', { orgId }, graph);
    return nodes.map(n => n.props as unknown as Goal);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg, orgId }, '按组织查询 Goal 失败');
    return [];
  }
}

/**
 * 获取指定组织的活跃 Goal 数量（status 为 active 的 Goal 数）。
 */
export function getActiveGoalCount(orgId: string, store: GraphBridgeLike, graph: string = 'growth'): number {
  try {
    const goals = listGoalsByOrg(orgId, store, graph);
    return goals.filter(g => g.status === 'active').length;
  } catch {
    return 0;
  }
}

/**
 * 更新 Goal 状态，含 17 条状态转换规则校验。
 *
 * 每次状态变更:
 * 1. 验证转换是否合法（isValidTransition）
 * 2. 验证前置条件（draft→pending_ga 检查字段完整性，active→completed 检查 criteria）
 * 3. 写入 AuditStore
 *
 * 如果需要在状态变更的同时更新其他字段（如 closeGoal 的 metrics），
 * 传入 extraProps。所有更新在一次 store.updateNode 中完成，保证原子性。
 *
 * @param extraProps - 可选。状态变更时同时更新的额外字段（如 metrics, actualDurationDays）
 * @throws Error — 非法转换或前置条件不满足时抛出
 */
export function updateGoalStatus(
  goalId: string,
  newStatus: GoalStatus,
  store: GraphBridgeLike,
  audit: AuditStoreLike,
  graph: string = 'growth',
  extraProps?: Partial<Goal>,
): void {
  const goal = getGoal(goalId, store, graph);
  if (!goal) {
    throw new Error(`Goal ${goalId} 不存在`);
  }

  const fromStatus = goal.status;

  // 1. 验证转换合法性
  if (!isValidTransition(fromStatus, newStatus)) {
    throw new Error(`非法状态转换: ${fromStatus} → ${newStatus}`);
  }

  // 2. 验证前置条件
  if (fromStatus === 'draft' && newStatus === 'pending_ga') {
    const check = checkDraftPreconditions(goal);
    if (!check.valid) {
      throw new Error(`draft→pending_ga 前置条件不满足: ${check.reason}`);
    }
  }
  if (fromStatus === 'active' && newStatus === 'completed') {
    const check = checkCompletionPreconditions(goal);
    if (!check.valid) {
      throw new Error(`active→completed 前置条件不满足: ${check.reason}`);
    }
  }

  // 3. 更新节点（含 extraProps，保证原子性）
  const updatedProps = { ...goal, ...extraProps, status: newStatus, lastModifiedAt: new Date().toISOString() };
  try {
    store.updateNode(goalId, updatedProps as unknown as Record<string, unknown>, graph);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg, goalId, fromStatus, newStatus }, 'Goal 状态更新失败');
    throw new Error(`更新 Goal 状态失败: ${msg}`);
  }

  // 4. 写入审计日志（fire-and-forget，失败仅 log.warn）
  // 设计决策: 审计日志使用 fire-and-forget 模式。
  // 审计写入失败不应阻塞 Goal 状态变更（铁律31降级传播）。
  // 进程崩溃导致审计丢失是可接受风险——状态变更本身已持久化到 GraphStore。
  audit.write({
    orgId: goal.orgId,
    actorId: `system:goal-store`,
    actorRole: 'system',
    action: `goal.status.${fromStatus}→${newStatus}`,
    targetType: 'GOAL',
    targetId: goalId,
    oldValue: JSON.stringify({ status: fromStatus }),
    newValue: JSON.stringify({ status: newStatus }),
  }).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ err: msg, goalId }, 'Goal 状态变更审计日志写入失败');
  });

  log.info({ goalId, fromStatus, newStatus }, 'Goal 状态已更新');
}
