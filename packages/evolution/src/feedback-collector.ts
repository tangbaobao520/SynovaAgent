/**
 * feedback-collector.ts — 显式反馈采集器 (L0 进化层｜第二层: 组织自适应)
 *
 * 接收用户对诊断建议/哨兵告警的确认/修改/拒绝，持久化到 AgentMemoryStore。
 * 已迁移自 src/evolution/feedback-collector.ts (Phase P0-1)。
 *
 * 铁律 24+31: AgentMemoryStore 不可用时降级到内存 Map，不阻断主流程。
 * 铁律 46: 不引用 engine-core。直接依赖 @synova/logger + AgentMemoryStoreLike。
 */

import { createLogger } from '@synova/logger';
import type { AgentMemoryStoreLike } from './evolution-types';

const log = createLogger('evolution/feedback-collector');

// ═══ Types ═══

export interface FeedbackInput {
  /** 组织 ID — 必选, 用于租户隔离 */
  orgId: string;
  /** 提案/哨兵动作 ID */
  actionId: string;
  /** 关联哨兵 ID (可选, 用于后期按哨兵聚合分析) */
  sentinelId?: string;
  /** 用户决策 */
  decision: 'confirm' | 'modify' | 'reject';
  /** 用户修改后的建议内容 */
  modifiedSuggestion?: string;
  /** 用户理由 (可能含具体数值, 供 org-adapter 后续解析为事实) */
  reason?: string;
  /** 用户标识 */
  userId?: string;
}

export interface FeedbackRecord {
  id: string;
  orgId: string;
  actionId: string;
  sentinelId?: string;
  decision: string;
  originalSuggestion?: string;
  modifiedSuggestion?: string;
  reason?: string;
  userId?: string;
  timestamp: string;
}

// ═══ 内存降级存储 ═══

const store = new Map<string, FeedbackRecord>();

// ═══ Public API ═══

/**
 * 收集用户反馈。
 * 主路径: 写入 AgentMemoryStore (type:'user_correction')
 * 降级路径: 写入内存 Map (AgentMemoryStore 不可用时)
 */
export async function collectFeedback(
  input: FeedbackInput,
  memoryStore?: AgentMemoryStoreLike,
): Promise<{ ok: boolean; record: FeedbackRecord; persisted: boolean }> {
  const id = `fb_${Date.now().toString(36)}`;
  const record: FeedbackRecord = {
    id,
    orgId: input.orgId,
    actionId: input.actionId,
    sentinelId: input.sentinelId,
    decision: input.decision,
    modifiedSuggestion: input.modifiedSuggestion,
    reason: input.reason,
    userId: input.userId,
    timestamp: new Date().toISOString(),
  };

  // 始终写入内存 Map (降级路径)
  store.set(id, record);

  let persisted = false;
  if (memoryStore) {
    try {
      const confidence = input.decision === 'confirm' ? 0.9 : input.decision === 'modify' ? 0.7 : 0.5;
      const sentinelTag = input.sentinelId || 'unknown';
      memoryStore.remember({
        orgId: input.orgId,
        key: `correction_${sentinelTag}_${id}`,
        value: JSON.stringify(record),
        type: 'enterprise_fact',
        confidence,
        source: 'user_feedback',
        tags: ['user_correction', input.decision, sentinelTag],
        expiresAt: null, // 永久保留
      });
      persisted = true;
    } catch (err: unknown) {
      log.warn({ err }, 'feedback 写入 AgentMemoryStore 失败 — 降级到内存');
    }
  }

  log.info({ id, orgId: input.orgId, decision: input.decision, persisted }, '反馈已收集');
  return { ok: true, record, persisted };
}

/**
 * 按 actionId 查询反馈记录（从内存 Map 查）。
 * 用于当前会话中快速检索。
 */
export function getFeedbackByAction(actionId: string): FeedbackRecord[] {
  return Array.from(store.values())
    .filter(f => f.actionId === actionId)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

/**
 * 按 orgId 查询反馈记录（从内存 Map 查）。
 */
export function getFeedbackByOrg(orgId: string): FeedbackRecord[] {
  return Array.from(store.values())
    .filter(f => f.orgId === orgId)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}
