/**
 * src/growth/goal-sentinel-lifecycle.ts — 方案哨兵生命周期 (D73)
 *
 * Goal 生命周期事件 → 方案哨兵操作:
 *   active    → registerOnGoalActive(goalId)  注册哨兵
 *   completed → unregisterOnGoalClosed(goalId) 注销哨兵
 *   abandoned → unregisterOnGoalClosed(goalId) 注销哨兵
 *   paused    → pauseOnGoalPaused(goalId)     暂停哨兵
 *   paused→active → resumeOnGoalResumed(goalId) 恢复哨兵
 *
 * 铁律 24+31: 各操作独立 try/catch，失败不阻断主流程
 */
import { createLogger } from '@synova/logger';
import type { Goal, GraphBridgeLike } from './goal-types';
import type { SentinelRegistry } from '../sentinel/types';
import type { GoalSentinelState } from './goal-sentinel';
import { getGoal } from './goal-store';
import { registerGoalSentinel, unregisterGoalSentinel, createGoalSentinel } from './goal-sentinel';

const log = createLogger('growth/goal-sentinel-lifecycle');

// ═══ 哨兵状态存储（内存 — D87将迁移到GraphStore） ═══

/** 方案哨兵状态: goalId → GoalSentinelState */
const sentinelStates = new Map<string, GoalSentinelState>();

// ═══ 生命周期函数 ═══

/**
 * Goal 转为 active 时自动注册方案哨兵。
 *
 * 降级: 注册失败仅 log.warn，不抛出异常（不阻断状态转换）。
 */
export function registerOnGoalActive(
  goalId: string,
  store: GraphBridgeLike,
  sentinelRegistry: SentinelRegistry,
): void {
  try {
    const goal = getGoal(goalId, store);
    if (!goal) {
      log.warn({ goalId }, 'registerOnGoalActive: Goal 不存在');
      return;
    }

    registerGoalSentinel(goal, sentinelRegistry);
    log.info({ goalId }, '方案哨兵已注册 (active)');
  } catch (err) {
    log.warn({ err, goalId }, 'registerOnGoalActive 失败 — 不阻断');
  }
}

/**
 * Goal 完成/废弃时注销方案哨兵。
 */
export function unregisterOnGoalClosed(
  goalId: string,
  sentinelRegistry: SentinelRegistry,
): void {
  try {
    unregisterGoalSentinel(goalId, sentinelRegistry);
    sentinelStates.delete(goalId);
    log.info({ goalId }, '方案哨兵已注销 (closed)');
  } catch (err) {
    log.warn({ err, goalId }, 'unregisterOnGoalClosed 失败 — 不阻断');
  }
}

/**
 * Goal 暂停时暂停方案哨兵。
 *
 * 当前策略: 注销哨兵（暂停期间不检查，恢复时重新注册）。
 */
export function pauseOnGoalPaused(
  goalId: string,
  sentinelRegistry: SentinelRegistry,
): void {
  try {
    unregisterGoalSentinel(goalId, sentinelRegistry);
    log.info({ goalId }, '方案哨兵已暂停');
  } catch (err) {
    log.warn({ err, goalId }, 'pauseOnGoalPaused 失败 — 不阻断');
  }
}

/**
 * Goal 恢复时恢复方案哨兵。
 */
export function resumeOnGoalResumed(
  goalId: string,
  store: GraphBridgeLike,
  sentinelRegistry: SentinelRegistry,
): void {
  registerOnGoalActive(goalId, store, sentinelRegistry);
}
