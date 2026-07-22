/**
 * src/growth/action-store.ts — ActionStore (D21)
 *
 * Action 持久化 + 生命周期状态机。
 * 基于 GraphStore 存储，支持跨部门协作。
 *
 * 6 态状态机: created → assigned → in_progress → completed → verified → closed
 * 不可跳转，不可逆，closed 后不可变更。
 *
 * 契约:
 *   @input  — SentinelFinding + 可选 assignee/department
 *   @output — Action (含完整 16 字段)
 *   @degraded — GraphStore 不可用时返回 null + log.warn
 */
import { randomUUID } from 'crypto';
import { createLogger } from '@synova/logger';
import type { Action, ActionLifecycle, ActionStoreLike } from './action-types';
import { ACTION_LIFECYCLE_ORDER } from './action-types';
import type { SentinelFinding } from '../agent/proactive-push';

const log = createLogger('growth/action-store');

// ═══ 状态转换规则 ═══

/**
 * 验证生命周期转换是否合法。
 * 规则: 只能前进到下一个状态，不能跳过。
 * closed 后不可变更。
 */
export function isValidTransition(from: ActionLifecycle, to: ActionLifecycle): boolean {
  if (from === 'closed') return false; // closed 不可逆
  const fromIdx = ACTION_LIFECYCLE_ORDER.indexOf(from);
  const toIdx = ACTION_LIFECYCLE_ORDER.indexOf(to);
  return toIdx === fromIdx + 1; // 只能前进 1 步
}

// ═══ ActionStore ═══

export class ActionStore implements ActionStoreLike {
  private store: { createNode(type: string, props: Record<string, unknown>, graph: string): string; getNode(id: string, graph: string): unknown | null; updateNode(id: string, props: Record<string, unknown>, graph: string): void; queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{ id: string; type: string; props: Record<string, unknown> }> } | null = null;

  constructor(store?: typeof ActionStore.prototype.store) {
    this.store = store || null;
  }

  /** 注入 GraphStore */
  setStore(s: typeof ActionStore.prototype.store): void {
    this.store = s;
  }

  /**
   * 从哨兵信号创建 Action。
   * 自动分配 lifecycle='created' + 时间戳。
   *
   * @param finding — 触发此 Action 的哨兵信号
   * @param assignee — 可选的负责人
   * @param department — 可选的责任部门
   * @returns Action，降级时返回 null
   */
  createAction(finding: SentinelFinding, assignee?: string, department?: string): Action {
    const now = new Date().toISOString();
    const action: Action = {
      id: randomUUID(),
      signalId: finding.id,
      lifecycle: 'created',
      assignee,
      department,
      createdAt: now,
      updatedAt: now,
    };

    if (!this.store) {
      log.warn({ signalId: finding.id }, 'GraphStore 未配置 — Action 创建降级（仅返回内存对象）');
      return action;
    }

    try {
      this.store.createNode('ACTION', action as unknown as Record<string, unknown>, 'growth');
      log.info({ actionId: action.id, signalId: finding.id }, 'Action 已创建');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg, signalId: finding.id }, 'Action 创建写入失败 — 降级');
    }

    return action;
  }

  /**
   * 更新 Action 生命周期状态。
   * 验证转换合法性，非法转换抛出 Error。
   *
   * @param actionId — Action ID
   * @param newState — 目标状态
   * @returns 更新后的 Action
   * @throws Error — 非法转换或 Action 不存在时
   */
  updateLifecycle(actionId: string, newState: ActionLifecycle): Action {
    if (!this.store) {
      throw new Error('GraphStore 未配置');
    }

    const node = this.store.getNode(actionId, 'growth') as { id: string; type: string; props: Record<string, unknown> } | null;
    if (!node) {
      throw new Error(`Action ${actionId} 不存在`);
    }

    const action = node.props as unknown as Action;
    const fromState = action.lifecycle;

    if (!isValidTransition(fromState, newState)) {
      throw new Error(`非法生命周期转换: ${fromState} → ${newState}`);
    }

    const now = new Date().toISOString();
    const updated: Partial<Action> = {
      lifecycle: newState,
      updatedAt: now,
      closedAt: newState === 'closed' ? now : action.closedAt,
    };

    try {
      this.store.updateNode(actionId, { ...node.props, ...updated } as Record<string, unknown>, 'growth');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg, actionId }, 'Action 状态更新失败 — 降级');
      throw new Error(`更新 Action 状态失败: ${msg}`);
    }

    return { ...action, ...updated };
  }

  /**
   * 按信号 ID 查询 Action。
   */
  getActionsBySignal(signalId: string): Action[] {
    if (!this.store) return [];
    try {
      const nodes = this.store.queryNodes('ACTION', { signalId } as Record<string, unknown>, 'growth');
      return nodes.map(n => n.props as unknown as Action);
    } catch {
      return [];
    }
  }

  /**
   * 按部门查询 Action。
   */
  getActionsByDepartment(department: string): Action[] {
    if (!this.store) return [];
    try {
      const nodes = this.store.queryNodes('ACTION', {} as Record<string, unknown>, 'growth');
      return nodes
        .map(n => n.props as unknown as Action)
        .filter(a => a.department === department || a.collaborators?.includes(department));
    } catch {
      return [];
    }
  }

  /**
   * 按循环执行查询 Action。
   */
  getActionsByLoop(loopId: string, executionId: string): Action[] {
    if (!this.store) return [];
    try {
      const nodes = this.store.queryNodes('ACTION', {} as Record<string, unknown>, 'growth');
      return nodes
        .map(n => n.props as unknown as Action)
        .filter(a => a.loopAssociation?.loopId === loopId && a.loopAssociation?.executionId === executionId);
    } catch {
      return [];
    }
  }
}
