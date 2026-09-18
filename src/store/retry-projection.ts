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
 * 消费缝（D810 接线）: 重试事件的**写入**在 src/llm/retry-middleware.ts（`appendRetryEvent`，
 * 共享基础设施层——铁律 39 禁 L2 静态 import src/store，写入缝须在 L2 可合法 import 的层）；
 * 本模块只负责**投影**（读同一 `RETRY_EVENT_KIND` 常量）：
 *   - 生产写入方 = src/agent/tool-loop-executor.ts（onRetry → callWithResilience 的 onRetry）
 *   - 投影单元注册 = src/deploy/bootstrap.ts 副作用导入本模块（同 session-projection 范式）
 *
 * 契约 (铁律 47):
 *   @input  — D500 事件流（event_type='system' 且 payload.kind === RETRY_EVENT_KIND）
 *   @output — RetryStatsState（totalRetries/byProvider/byCode/lastSeq）
 *   @degraded — apply 对非法载荷（缺 kind/provider/code）原样返回前状态（不计数不前移）；
 *               计数器型历史依赖投影，不声明 wholeValue（D588 断言按定义逐单元启用）
 */
import {
  registerProjection,
  type ProjectionDefinition,
} from './session-projection';
// 语义单源: 重试事件 kind 由韧性层（写入侧）定义，投影侧只读不复制（防双源漂移 M7）
import { RETRY_EVENT_KIND } from '../llm/retry-middleware';

/** 投影 key（checkpoint 行 / stateOf 查询名） */
export const RETRY_PROJECTION_KEY = 'llm_retry_stats';

/** 重试统计派生态（计数器型，历史依赖——seq 水位幂等） */
export interface RetryStatsState {
  totalRetries: number;
  byProvider: Record<string, number>;
  byCode: Record<string, number>;
  lastSeq: number;
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
 * 重试事件落盘入口已迁至写入侧（D810）: `src/llm/retry-middleware.ts#appendRetryEvent`。
 * 迁移原因——铁律 39 禁 L2 静态 import src/store，而写入方恰是 L2 LLM 调用链
 * （tool-loop-executor）；迁到共享基础设施层后 L2 可合法调用，且 kind 常量单源。
 */

// ═══ import 即接线（D588 范式: 订阅缝已由 session-projection 安装，此处注册投影单元）═══
registerProjection(retryProjectionDefinition());
