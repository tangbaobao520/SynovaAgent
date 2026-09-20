/**
 * feedback-collector.ts — 反馈采集器 (L0 进化层｜第二层)
 *
 * 采集四种来源的反馈:
 *   ① ga_explicit — GA 对诊断建议/哨兵告警的确认/修改/拒绝
 *   ② user_behavior — 企业行为隐式反馈
 *   ③ external_data — 外部数据自动聚合
 *   ④ diagnosis_contradiction — 哨兵-诊断矛盾检测
 *
 * 铁律 24+31: 每路独立 try/catch，单路失败不阻断整体。
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

const store = new Map<string, FeedbackRecord>();

// D829: id 唯一性 — 旧实现 `fb_${Date.now().toString(36)}` 在同一毫秒内的连续写入会得到**相同 id**，
// 而持久化 key = `correction_${id}` 且 AgentMemoryStore 按 (orgId,key) UPSERT →
// 同毫秒的第 2..N 条纠错会**静默覆盖**第 1 条（实测 5 连写 distinct=1）。
// 追加随机后缀（同 rule-version-manager.createSnapshot 的 snap_ 命名法）。
function nextFeedbackId(): string {
  return `fb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

// ═══ 已有函数 ═══
export async function collectFeedback(
  input: FeedbackInput, memoryStore?: AgentMemoryStoreLike,
): Promise<{ ok: boolean; record: FeedbackRecord; persisted: boolean }> {
  const id = nextFeedbackId();
  const record: FeedbackRecord = { id, orgId: input.orgId, actionId: input.actionId,
    sentinelId: input.sentinelId, decision: input.decision,
    modifiedSuggestion: input.modifiedSuggestion, reason: input.reason,
    userId: input.userId, timestamp: new Date().toISOString() };
  store.set(id, record);
  let persisted = false;
  if (memoryStore) {
    try {
      memoryStore.remember({ orgId: input.orgId, key: `correction_${id}`,
        value: JSON.stringify(record), type: 'enterprise_fact',
        confidence: input.decision === 'confirm' ? 0.9 : 0.7, source: 'user_feedback',
        tags: ['user_correction', input.decision, input.sentinelId || 'unknown'], expiresAt: null });
      persisted = true;
    } catch (err: unknown) { log.warn({ err }, 'feedback write failed'); }
  }
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
      const entries = memoryStore.list({ orgId: '', type: 'enterprise_fact', tags: ['user_correction'], limit: 100 });
      for (const e of entries) allEvents.push({ id: `ga_${Date.now().toString(36)}`, source: 'ga_explicit' as const,
        timestamp: new Date().toISOString(), teamId: '', payload: { value: e.value }, requiresReview: false, autoApplicable: true });
    }
  } catch (err: unknown) { errors.push(`ga_explicit: ${err instanceof Error ? err.message : String(err)}`); }
  if (behavioralFn) { try { allEvents.push(...behavioralFn().map(e => ({ ...e, source: 'user_behavior' as const }))); } catch (err: unknown) { errors.push(`behavioral: ${err instanceof Error ? err.message : String(err)}`); } }
  if (externalFn) { try { allEvents.push(...externalFn().map(e => ({ ...e, source: 'external_data' as const }))); } catch (err: unknown) { errors.push(`external: ${err instanceof Error ? err.message : String(err)}`); } }
  if (contradictionFn) { try { allEvents.push(...contradictionFn().map(e => ({ ...e, source: 'diagnosis_contradiction' as const }))); } catch (err: unknown) { errors.push(`contradiction: ${err instanceof Error ? err.message : String(err)}`); } }
  return { events: allEvents, autoApplied: allEvents.filter(e => e.autoApplicable).length, reviewRequired: allEvents.filter(e => e.requiresReview).length, errors, degraded: errors.length > 0 };
}

// ═══ D829: GA 校准动作 → evolution decision 映射（L0 语义留 L0，L1 只薄调用） ═══

/** GA 校准四动作（与 routes/ga-calibration 的 CALIBRATION_ACTIONS 同源口径） */
export type GaCalibrationAction = 'mark_error' | 'add_context' | 'rewrite_logic' | 'demote_signal';

/** GA 校准 → L0 进化收集输入（L1 路由透传；不含 store，store 走第 2 参注入） */
export interface GaCalibrationFeedbackInput {
  orgId: string;
  /** 被判定的对象 id（诊断结论/逻辑/信号 id）—— 成为 FeedbackRecord.actionId，供「同类纠错」回溯 */
  targetId: string;
  action: GaCalibrationAction;
  sentinelId?: string;
  reason?: string;
  modifiedSuggestion?: string;
  userId?: string;
}

/** collectGaCalibrationFeedback 结果 */
export interface GaCalibrationCollectResult {
  /** 是否作为纠错信号被收集（add_context / 未知动作 = false） */
  collected: boolean;
  /** collected=false 的原因: not_a_correction = 该动作非纠错信号（不落库）；collect_failed = 收集异常 */
  reason?: 'not_a_correction' | 'collect_failed';
  record?: FeedbackRecord;
  /** 是否已持久化到 AgentMemoryStore（OrgAdapter 消费形状: enterprise_fact + tags[user_correction]） */
  persisted: boolean;
  /** 诚实降级标记: 未持久化或收集异常 = true（铁律 31），调用方须传播 */
  degraded: boolean;
}

/**
 * GA 校准动作 → growth decision 映射（spec §7.1 口径）。
 * evolution 无 'ineffective' 枚举 → demote_signal 归一为 'reject'（否定该信号相关性）；
 * 与 mark_error 的区分度由 sentinelId + reason 承载。
 * add_context 不映射（背景卡是上下文增强，非纠错信号）。
 */
const GA_CALIBRATION_DECISION: Partial<Record<GaCalibrationAction, FeedbackInput['decision']>> = {
  mark_error: 'reject',
  rewrite_logic: 'modify',
  demote_signal: 'reject',
};

/**
 * 收集一条 GA 校准反馈进 L0 收集器（线 17-1「反馈有真实消费方」的生产侧）。
 *
 * 契约:
 *   @input  — input: GaCalibrationFeedbackInput；memoryStore?: AgentMemoryStoreLike
 *             （传 store → 落 enterprise_fact + tags['user_correction', decision, sentinelId]，
 *              该形状即 OrgAdapter / collectAllFeedback 的消费源）
 *   @output — GaCalibrationCollectResult{collected, reason?, record?, persisted, degraded}
 *   @degraded — 未注入 memoryStore / 写入失败 → persisted=false + degraded=true（log.warn 非空吞，铁律 24）
 *   @error  — 不抛：内部 collectFeedback 已捕获存储异常；本函数再兜一层（collect_failed）
 *   @guard  — add_context 与未知动作 → collected=false, reason='not_a_correction'，零写入、不抛
 */
export async function collectGaCalibrationFeedback(
  input: GaCalibrationFeedbackInput, memoryStore?: AgentMemoryStoreLike,
): Promise<GaCalibrationCollectResult> {
  const decision = GA_CALIBRATION_DECISION[input.action];
  if (!decision) {
    return { collected: false, reason: 'not_a_correction', persisted: false, degraded: false };
  }
  try {
    const r = await collectFeedback({
      orgId: input.orgId, actionId: input.targetId, sentinelId: input.sentinelId,
      decision, modifiedSuggestion: input.modifiedSuggestion,
      reason: input.reason, userId: input.userId,
    }, memoryStore);
    return { collected: true, record: r.record, persisted: r.persisted, degraded: !r.persisted };
  } catch (err: unknown) {
    log.error({ err, action: input.action, targetId: input.targetId }, 'GA 校准 → L0 收集失败（铁律 24/31）');
    return { collected: false, reason: 'collect_failed', persisted: false, degraded: true };
  }
}
