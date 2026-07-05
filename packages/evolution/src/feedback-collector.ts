/**
 * feedback-collector.ts — 反馈采集器 (L0 进化层｜第二层)
 *
 * 采集四种来源的反馈:
 *   ① ga_explicit — GA 对诊断建议/哨兵告警的确认/修改/拒绝
 *   ② user_behavior — 企业行为隐式反馈
 *   ③ external_data — 外部数据自动聚合
 *   ④ diagnosis_contradiction — 哨兵-诊断矛盾检测
 *
 * 铁律 24+31: 每路独立 try/catch。
 * 铁律 46: 不引用 engine-core。
 */
import { createLogger } from '@synova/logger';
import type { AgentMemoryStoreLike } from './evolution-types';

const log = createLogger('evolution/feedback-collector');

// ═══ 已有类型 ═══
export interface FeedbackInput {
  orgId: string; actionId: string; sentinelId?: string;
  decision: 'confirm' | 'modify' | 'reject';
  modifiedSuggestion?: string; reason?: string; userId?: string;
}
export interface FeedbackRecord {
  id: string; orgId: string; actionId: string; sentinelId?: string;
  decision: string; originalSuggestion?: string; modifiedSuggestion?: string;
  reason?: string; userId?: string; timestamp: string;
}

// ═══ v3 新增类型 ═══
export interface FeedbackEvent {
  id: string;
  source: 'ga_explicit' | 'user_behavior' | 'external_data' | 'diagnosis_contradiction';
  timestamp: string; teamId: string; payload: Record<string, unknown>;
  requiresReview: boolean; autoApplicable: boolean;
}
export interface CollectResult {
  events: FeedbackEvent[]; autoApplied: number; reviewRequired: number;
  errors: string[]; degraded: boolean;
}

// ═══ 内存降级存储 ═══
const store = new Map<string, FeedbackRecord>();

// ═══ 已有函数 ═══
export async function collectFeedback(
  input: FeedbackInput, memoryStore?: AgentMemoryStoreLike,
): Promise<{ ok: boolean; record: FeedbackRecord; persisted: boolean }> {
  const id = `fb_${Date.now().toString(36)}`;
  const record: FeedbackRecord = { id, orgId: input.orgId, actionId: input.actionId,
    sentinelId: input.sentinelId, decision: input.decision,
    modifiedSuggestion: input.modifiedSuggestion, reason: input.reason,
    userId: input.userId, timestamp: new Date().toISOString() };
  store.set(id, record);
  let persisted = false;
  if (memoryStore) {
    try {
      const confidence = input.decision === 'confirm' ? 0.9 : input.decision === 'modify' ? 0.7 : 0.5;
      const sentinelTag = input.sentinelId || 'unknown';
      memoryStore.remember({ orgId: input.orgId, key: `correction_${sentinelTag}_${id}`,
        value: JSON.stringify(record), type: 'enterprise_fact', confidence, source: 'user_feedback',
        tags: ['user_correction', input.decision, sentinelTag], expiresAt: null });
      persisted = true;
    } catch (err: unknown) { log.warn({ err }, 'feedback write failed'); }
  }
  log.info({ id, orgId: input.orgId, decision: input.decision, persisted }, 'feedback collected');
  return { ok: true, record, persisted };
}
export function getFeedbackByAction(actionId: string): FeedbackRecord[] {
  return Array.from(store.values()).filter(f => f.actionId === actionId)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}
export function getFeedbackByOrg(orgId: string): FeedbackRecord[] {
  return Array.from(store.values()).filter(f => f.orgId === orgId)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

// ═══ v3 新增: collectAllFeedback ═══
export async function collectAllFeedback(
  memoryStore?: AgentMemoryStoreLike,
  behavioralFn?: () => FeedbackEvent[],
  externalFn?: () => FeedbackEvent[],
  contradictionFn?: () => FeedbackEvent[],
): Promise<CollectResult> {
  const errors: string[] = [];
  const allEvents: FeedbackEvent[] = [];
  try {
    if (memoryStore) {
      const corrections = memoryStore.list({ orgId: '', type: 'enterprise_fact', tags: ['user_correction'], limit: 100 });
      for (const entry of corrections) {
        allEvents.push({ id: `ga_${Date.now().toString(36)}`, source: 'ga_explicit' as const,
          timestamp: new Date().toISOString(), teamId: '', payload: { value: entry.value },
          requiresReview: false, autoApplicable: true });
      }
    }
  } catch (err: unknown) { errors.push(`ga_explicit: ${err instanceof Error ? err.message : String(err)}`); }
  if (behavioralFn) { try { allEvents.push(...behavioralFn().map(e => ({ ...e, source: 'user_behavior' as const }))); } catch (err: unknown) { errors.push(`user_behavior: ${err instanceof Error ? err.message : String(err)}`); } }
  if (externalFn) { try { allEvents.push(...externalFn().map(e => ({ ...e, source: 'external_data' as const }))); } catch (err: unknown) { errors.push(`external_data: ${err instanceof Error ? err.message : String(err)}`); } }
  if (contradictionFn) { try { allEvents.push(...contradictionFn().map(e => ({ ...e, source: 'diagnosis_contradiction' as const }))); } catch (err: unknown) { errors.push(`diagnosis_contradiction: ${err instanceof Error ? err.message : String(err)}`); } }
  return { events: allEvents, autoApplied: allEvents.filter(e => e.autoApplicable).length, reviewRequired: allEvents.filter(e => e.requiresReview).length, errors, degraded: errors.length > 0 };
}
