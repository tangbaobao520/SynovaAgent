/**
 * src/growth/action-types.ts — Action 类型定义 (D21)
 *
 * 权威文档 #5 Module 5 §5.1.1: Action 是一级实体，与节点/边/哨兵/信号同级。
 * Action 由哨兵信号触发，关联到具体 Loop 执行，有完整生命周期。
 * 16 字段完整定义，含跨部门协作。
 */
import type { SentinelFinding } from '../agent/proactive-push';

// ═══ Action 生命周期 6 态 ═══

/**
 * Action 生命周期状态机:
 *   created → assigned → in_progress → completed → verified → closed
 *
 * 不可跳转: created 不能直接到 verified
 * 不可逆: closed 后不可变更
 */
export type ActionLifecycle = 'created' | 'assigned' | 'in_progress' | 'completed' | 'verified' | 'closed';

/** 全部合法 Action 生命周期状态 */
export const ACTION_LIFECYCLE_ORDER: readonly ActionLifecycle[] = [
  'created', 'assigned', 'in_progress', 'completed', 'verified', 'closed',
];

// ═══ 关联循环 ═══

export interface LoopAssociation {
  loopId: string;
  scale: 'fast' | 'medium' | 'slow';
  executionId: string;
}

// ═══ 验证信息 ═══

export interface ActionVerification {
  verifiedBy: string;
  verifiedAt: string;
  evidenceRefs: string[];
}

// ═══ Action 16 字段 ═══

export interface Action {
  /** 唯一标识 */
  id: string;
  /** 触发此 Action 的哨兵信号 ID（因果锚点） */
  signalId: string;
  /** 创建此 Action 的对话 ID */
  conversationId?: string;
  /** 责任部门 */
  department?: string;
  /** 负责人 */
  assignee?: string;
  /** 协作部门列表（跨部门协同） */
  collaborators?: string[];
  /** 当前生命周期状态 */
  lifecycle: ActionLifecycle;
  /** 关联的循环执行 */
  loopAssociation?: LoopAssociation;
  /** 验证信息（GA 或中层标记 verified 时填写） */
  verification?: ActionVerification;
  /** 创建时间 */
  createdAt: string;
  /** 最后更新时间 */
  updatedAt: string;
  /** 关闭时间 */
  closedAt?: string;
}

// ═══ ActionStore 最小接口（供 ProactivePush 使用） ═══

export interface ActionStoreLike {
  createAction(finding: SentinelFinding, assignee?: string, department?: string): Action;
  updateLifecycle(actionId: string, newState: ActionLifecycle): Action;
}
