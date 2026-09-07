/**
 * store/retry-projection.ts — LLM 重试计数投影 (D593, DSH 借鉴卡 B-02)
 *
 * 在 D500 事件流（session-store.ts appendEvent, append-only）之上派生「LLM 重试统计」:
 *   - 事件通道: event_type='system'（D500 CHECK 既有类型，log-only——deriveMessages 只投影
 *     message/tool_result，重试事件不污染模型可见消息历史）
 *   - 载荷形态: { kind: 'llm_retry', provider, code, attempt, delayMs, at }（DSH llm/retry 语义）
 *   - 派生态: 总重试次数 / 按 provider / 按失败码 / 观察水位（seq 幂等防线）
 *
 * 接线（D588 import 即接线范式）: 模块加载时经 registerProjection 把
 * retryProjectionDefinition() 注册进 sessionProjections 单例——appendEvent 订阅缝
 * 自动 drive，生产全部 SessionStore 构造点零修改获得重试统计。
 *
 * 消费缝: src/llm 层禁 import src/store（分层解耦）——重试事件由 L2 消费方经
 * appendRetryEvent 落盘（onRetry 回调 → 桥接函数）。
 *
 * 契约 (铁律 47):
 *   @input  — appendRetryEvent(store, sessionId, {provider, code, attempt?, delayMs?, mode?})；
 *             provider/code 必须非空字符串
 *   @output — RetryStatsState（totalRetries/byProvider/byCode/lastSeq）；非法 payload →
 *             { ok:false, degraded:true, error }（不落盘，铁律 24/31）
 *   @degraded — apply 对非法载荷（缺 kind/provider/code）原样返回前状态（不计数不前移）；
 *               计数器型历史依赖投影，不声明 wholeValue（D588 断言按定义逐单元启用）
 */
import {
  registerProjection,
  type ProjectionDefinition,
} from './session-projection';
import type { SessionStore, AppendEventResult } from './session-store';

/** 投影 key（checkpoint 行 / stateOf 查询名） */
export const RETRY_PROJECTION_KEY = 'llm_retry_stats';

/** 重试事件载荷 kind（payload.kind === 'llm_retry' 才计数） */
export const RETRY_EVENT_KIND = 'llm_retry';

/** 重试统计派生态（计数器型，历史依赖——seq 水位幂等） */
export interface RetryStatsState {
  totalRetries: number;
  byProvider: Record<string, number>;
  byCode: Record<string, number>;
  lastSeq: number;
}

/** appendRetryEvent 输入（attempt/delayMs/mode 可选——最小必需 provider+code） */
export interface RetryEventPayload {
  provider: string;
  code: string;
  attempt?: number;
  delayMs?: number;
  mode?: 'chat' | 'stream';
}

/** 投影定义工厂: 计数器初态 + seq 幂等计数 apply（注册表实例间可复用注册） */
export function retryProjectionDefinition(): ProjectionDefinition<RetryStatsState> {
  return {
    key: RETRY_PROJECTION_KEY,
    stateVersion: 1,
    init: () => ({ totalRetries: 0, byProvider: {}, byCode: {}, lastSeq: -1 }),
    apply: (state, event) => {
      if (event.seq <= state.lastSeq) return state; // 幂等防线 + Object.is 变更门契约
      if (event.eventType !== 'system') return state;
      const payload = event.payload as { kind?: unknown; provider?: unknown; code?: unknown } | null;
      if (payload === null || typeof payload !== 'object') return state;
      if (payload.kind !== RETRY_EVENT_KIND) return state;
      if (typeof payload.provider !== 'string' || payload.provider.length === 0) return state;
      if (typeof payload.code !== 'string' || payload.code.length === 0) return state;
      const next: RetryStatsState = {
        totalRetries: state.totalRetries + 1,
        byProvider: { ...state.byProvider },
        byCode: { ...state.byCode },
        lastSeq: event.seq,
      };
      next.byProvider[payload.provider] = (next.byProvider[payload.provider] ?? 0) + 1;
      next.byCode[payload.code] = (next.byCode[payload.code] ?? 0) + 1;
      return next;
    },
  };
}

/**
 * 重试事件落盘入口（L2 消费方桥接——onRetry 回调 → D500 事件流）。
 * @input  — provider/code 非空字符串（attempt/delayMs/mode 可选）
 * @output — appendEvent 结果透传 { ok:true, seq } | { ok:false, degraded:true, error }
 * @degraded — 校验失败不落盘，显式 error 消息（铁律 24: 不静默吞）
 */
export function appendRetryEvent(store: SessionStore, sessionId: string, event: RetryEventPayload): AppendEventResult {
  if (typeof event?.provider !== 'string' || event.provider.length === 0) {
    return { ok: false, degraded: true, error: 'retry event provider must be a non-empty string' };
  }
  if (typeof event.code !== 'string' || event.code.length === 0) {
    return { ok: false, degraded: true, error: 'retry event code must be a non-empty string' };
  }
  return store.appendEvent(sessionId, 'system', {
    kind: RETRY_EVENT_KIND,
    provider: event.provider,
    code: event.code,
    attempt: event.attempt,
    delayMs: event.delayMs,
    mode: event.mode,
    at: new Date().toISOString(),
  });
}

// ═══ import 即接线（D588 范式: 订阅缝已由 session-projection 安装，此处注册投影单元）═══
registerProjection(retryProjectionDefinition());
