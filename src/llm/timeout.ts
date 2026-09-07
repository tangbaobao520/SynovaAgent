/**
 * llm/timeout.ts — 三层超时原语 (D593, DSH 借鉴卡 B-06)
 *
 * 范式锚点: D:/deepseek-harness/packages/util/timeout/lib/index.js（0.1.1-rc.2，逐行读全文自研，零代码依赖）
 *
 * 三类失败必须区分（Anthropic 决策链）:
 *   - 截止 (deadline): 整次调用的绝对时限 → 超时按 code 归类（协作式取消，不抛裸异常）
 *   - 空闲 (idleWatchdog): 流式场景「多久没有新 token」→ 每 token pulse 重臂
 *   - 钳制 (clampTimeout): 任何超时值必须 ≤ MAX_TIMER_DELAY_MS（Node setTimeout 溢出防护，
 *     >2^31-1 的 delay 会立即触发——恰与预期相反）
 *
 * 契约 (铁律 47):
 *   @input  — timeoutMs 必须为正有限数（非法 fail-fast，不静默钳到默认值）；
 *             upstream signal 可选，abort 时 reason 原样透传（不吞上游语义）
 *   @output — deadline/idleWatchdog 返回 { signal, dispose }（idle 另有 pulse）；
 *             dispose 幂等；dispose 后 pulse 无害
 *   @degraded — 无（原语层不产生降级；消费方 retry-middleware 负责 outcome 化）
 */

/** Node setTimeout 溢出边界: delay > 2^31-1 时定时器立即触发（与预期相反） */
export const MAX_TIMER_DELAY_MS = 2_147_483_647;

/** 超时归类的稳定码（dev doc DS1 词汇；消费方 outcome.code） */
export const TOOL_TIMEOUT_CODE = 'TOOL_TIMEOUT';

/** 超时原因（Error 子类）: 消息合一 `${code} after ${timeoutMs}ms`，abort reason 携带 */
export class TimeoutReason extends Error {
  readonly code: string;
  readonly timeoutMs: number;

  constructor(code: string, timeoutMs: number) {
    super(`${code} after ${timeoutMs}ms`);
    this.name = 'TimeoutReason';
    this.code = code;
    this.timeoutMs = timeoutMs;
  }
}

/**
 * 钳制超时值到 [正有限, max]。
 * @param requestedMs — 调用方显式值；undefined 回落 fallbackMs
 * @param fallbackMs  — 缺省值（自身必须合法）
 * @param maxMs       — 上限（默认 MAX_TIMER_DELAY_MS 溢出防护）
 * @throws requestedMs 非 undefined 但非正有限数（fail-fast，不静默修正）
 */
export function clampTimeout(requestedMs: number | undefined, fallbackMs: number, maxMs: number = MAX_TIMER_DELAY_MS): number {
  if (requestedMs === undefined) return clampTimeout(fallbackMs, fallbackMs, maxMs);
  if (!Number.isFinite(requestedMs) || requestedMs <= 0) {
    throw new Error(`timeout must be a positive finite number of milliseconds, got ${String(requestedMs)}`);
  }
  return Math.min(requestedMs, maxMs);
}

/** deadline 结果: 融合后的信号 + 取消句柄 */
export interface Deadline {
  readonly signal: AbortSignal;
  /** 取消内部定时器与上游监听（幂等；调用后 signal 不再因本层 abort） */
  dispose(): void;
}

/**
 * 绝对截止: timeoutMs 后以 TimeoutReason abort；上游 signal abort 时提前透传。
 * 手动组合（不依赖 AbortSignal.any，Node 版本安全）。
 */
export function deadline(upstream: AbortSignal | undefined, timeoutMs: number, code: string): Deadline {
  const controller = new AbortController();
  const reason = new TimeoutReason(code, timeoutMs);
  const onUpstreamAbort = () => {
    clearTimeout(timer);
    controller.abort(upstream?.reason);
  };
  const timer = setTimeout(() => {
    upstream?.removeEventListener('abort', onUpstreamAbort);
    controller.abort(reason);
  }, timeoutMs);

  if (upstream?.aborted === true) {
    clearTimeout(timer);
    controller.abort(upstream.reason);
  } else if (upstream !== undefined) {
    upstream.addEventListener('abort', onUpstreamAbort, { once: true });
  }

  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer);
      upstream?.removeEventListener('abort', onUpstreamAbort);
    },
  };
}

/** idleWatchdog 结果: 信号 + 重臂脉冲 + 取消句柄 */
export interface IdleWatchdog {
  readonly signal: AbortSignal;
  /** 重臂: 有新进展（如收到 token）时调用，空闲计时从头计 */
  pulse(): void;
  /** 取消看门狗（幂等；调用后 pulse 无害） */
  dispose(): void;
}

/**
 * 空闲看门狗: 连续 timeoutMs 无 pulse() 调用则按 TimeoutReason abort；
 * 上游 signal abort 时提前透传。可重臂（DSH idleWatchdog 范式）。
 */
export function idleWatchdog(upstream: AbortSignal | undefined, timeoutMs: number, code: string): IdleWatchdog {
  const controller = new AbortController();
  let disposed = false;
  const onUpstreamAbort = () => {
    clearTimeout(timer);
    controller.abort(upstream?.reason);
  };
  const arm = () => {
    timer = setTimeout(() => {
      upstream?.removeEventListener('abort', onUpstreamAbort);
      controller.abort(new TimeoutReason(code, timeoutMs));
    }, timeoutMs);
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  arm();

  if (upstream?.aborted === true) {
    clearTimeout(timer);
    controller.abort(upstream.reason);
  } else if (upstream !== undefined) {
    upstream.addEventListener('abort', onUpstreamAbort, { once: true });
  }

  return {
    signal: controller.signal,
    pulse() {
      if (disposed || controller.signal.aborted) return;
      clearTimeout(timer);
      arm();
    },
    dispose() {
      disposed = true;
      clearTimeout(timer);
      upstream?.removeEventListener('abort', onUpstreamAbort);
    },
  };
}
