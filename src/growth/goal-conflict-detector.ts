/**
 * src/growth/goal-conflict-detector.ts — Goal 冲突检测器
 *
 * 检测同一部门内 Goal 之间的维度冲突（两个 Goal 涉及同一 metric 但方向相反），
 * 以及 Goal 被废弃后的级联影响。
 *
 * 契约:
 *   @input  — Goal + 现有 Goal 列表 / GraphStore
 *   @output — 冲突描述数组 / 级联影响 Goal ID 列表
 *   @degraded — GraphStore 不可用时返回空数组，不崩溃
 */
import { createLogger } from '@synova/logger';
import type { Goal, GraphBridgeLike } from './goal-types';
import { getGoal } from './goal-store';

const log = createLogger('growth/goal-conflict-detector');

// ═══ Types ═══

export interface ConflictDescription {
  /** 冲突 A 方的 Goal ID */
  goalA: string;
  /** 冲突 B 方的 Goal ID */
  goalB: string;
  /** 冲突的指标名称 */
  metricName: string;
  /** 冲突类型 */
  conflictType: 'direction' | 'resource' | 'timeline' | 'duplicate';
  /** 冲突详细描述 */
  description: string;
}

export interface CascadeImpact {
  /** 受影响的 Goal ID */
  impactedGoalId: string;
  /** 影响描述 */
  description: string;
}

export type ConflictResolution = 'merge' | 'prioritize_a' | 'prioritize_b' | 'parallel';

export interface ConflictResolutionRecord {
  goalA: string;
  goalB: string;
  resolution: ConflictResolution;
  resolvedAt: string;
  resolvedBy: string;
}

// ═══ 冲突检测 ═══

/**
 * 检测两个 Goal 之间是否存在维度冲突。
 *
 * 同一部门内两个 Goal 涉及同一 metricName 但 currentValue 方向相反
 * （一个目标增长[positive]、一个目标缩减[negative]）视为冲突。
 *
 * @param goal - 待检查的 Goal
 * @param existingGoals - 同部门现有的 Goal 列表
 * @returns 冲突描述数组
 */
export function detectConflicts(goal: Goal, existingGoals: Goal[]): ConflictDescription[] {
  const conflicts: ConflictDescription[] = [];

  for (const existing of existingGoals) {
    if (existing.goalId === goal.goalId) continue;

    // 检查同部门
    if (existing.ownerDeptId !== goal.ownerDeptId) continue;

    // 检查每个 metric 的方向冲突
    for (const existingMetric of existing.metrics) {
      const goalMetric = goal.metrics.find(m => m.metricName === existingMetric.metricName);
      if (!goalMetric) continue;

      const existingDirection = existingMetric.targetValue > existingMetric.currentValue ? 'up' : 'down';
      const goalDirection = goalMetric.targetValue > goalMetric.currentValue ? 'up' : 'down';

      if (existingDirection !== goalDirection) {
        conflicts.push({
          goalA: existing.goalId,
          goalB: goal.goalId,
          metricName: existingMetric.metricName,
          conflictType: 'direction',
          description: `Goal "${existing.goalId}" 与 "${goal.goalId}" 在指标 "${existingMetric.metricName}" 上方向冲突 ` +
            `(${existingDirection} vs ${goalDirection})`,
        });
      }
    }

    // 检查重复 Goal（相同 title）
    if (existing.title === goal.title && existing.description === goal.description) {
      conflicts.push({
        goalA: existing.goalId,
        goalB: goal.goalId,
        metricName: '',
        conflictType: 'duplicate',
        description: `Goal "${existing.goalId}" 与 "${goal.goalId}" 内容重复`,
      });
    }
  }

  return conflicts;
}

/**
 * 检测 Goal 被废弃后对其他 Goal 的级联影响。
 *
 * 遍历所有 Goal 的 dependsOn 字段，如果其中包含被废弃的 goalId，
 * 则记录为受影响。
 *
 * @param goalId - 被废弃（或即将废弃）的 Goal ID
 * @param store - GraphStore 实例
 * @param graph - 图名称
 * @returns 级联影响列表
 */
export function detectCascadeImpact(
  goalId: string,
  store: GraphBridgeLike,
  graph: string = 'growth',
): CascadeImpact[] {
  const impacts: CascadeImpact[] = [];

  try {
    const allGoals = store.queryNodes('GOAL', {}, graph);
    for (const node of allGoals) {
      const existing = node.props as unknown as Goal;
      if (existing.goalId === goalId) continue;

      if (existing.dependsOn && existing.dependsOn.includes(goalId)) {
        impacts.push({
          impactedGoalId: existing.goalId,
          description: `Goal "${existing.goalId}" 依赖的 Goal "${goalId}" 已被废弃，建议重新评估`,
        });
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ err: msg, goalId }, '级联影响检测失败 — 降级');
  }

  return impacts;
}

/**
 * 记录冲突解决结果。
 *
 * @returns 解决记录
 */
export function resolveConflict(
  goalA: string,
  goalB: string,
  resolution: ConflictResolution,
  resolvedBy: string,
): ConflictResolutionRecord {
  const record: ConflictResolutionRecord = {
    goalA,
    goalB,
    resolution,
    resolvedAt: new Date().toISOString(),
    resolvedBy,
  };

  log.info({ record }, 'Goal 冲突已解决');
  return record;
}
