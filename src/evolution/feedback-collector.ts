/**
 * feedback-collector.ts — 确认反馈接收器 (PRD §11.4, v3.5)
 * 接收人对建议的确认/修改/拒绝，写入 Evolution Engine
 */
import { createLogger } from '../logger';
import type { AgentMemoryStore, MemoryType } from '../l4/agent-memory-store';

const log = createLogger('evolution/feedback-collector');

export interface FeedbackInput {
  actionId: string;
  decision: 'confirm' | 'modify' | 'reject';
  modifiedSuggestion?: string;
  reason?: string;
  userId?: string;
}

export interface FeedbackRecord {
  id: string;
  actionId: string;
  decision: string;
  originalSuggestion?: string;
  modifiedSuggestion?: string;
  reason?: string;
  userId?: string;
  timestamp: string;
}

const store = new Map<string, FeedbackRecord>();

export async function collectFeedback(
  input: FeedbackInput,
  memoryStore?: AgentMemoryStore,
): Promise<{ ok: boolean; record: FeedbackRecord; persisted: boolean }> {
  const id = `fb_${Date.now().toString(36)}`;
  const record: FeedbackRecord = {
    id,
    actionId: input.actionId,
    decision: input.decision,
    modifiedSuggestion: input.modifiedSuggestion,
    reason: input.reason,
    userId: input.userId,
    timestamp: new Date().toISOString(),
  };
  store.set(id, record);

  let persisted = false;
  if (memoryStore) {
    try {
      const confidence = input.decision === 'confirm' ? 0.9 : input.decision === 'modify' ? 0.7 : 0.5;
      memoryStore.remember({
        orgId: input.actionId, key: `feedback_${id}`,
        value: JSON.stringify(record), type: 'enterprise_fact' as MemoryType,
        confidence, source: 'user_feedback', tags: ['feedback', input.decision],
      } as any);
      persisted = true;
    } catch (err: unknown) {
      log.warn({ err }, 'feedback写入AgentMemoryStore失败——degraded');
    }
  }

  log.info({ id, decision: input.decision, persisted }, '反馈已收集');
  return { ok: true, record, persisted };
}

export function getFeedbackByAction(actionId: string): FeedbackRecord[] {
  return Array.from(store.values())
    .filter(f => f.actionId === actionId)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}
