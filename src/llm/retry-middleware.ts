/**
 * llm/retry-middleware.ts — LLM 重试 + 超时中间件 (Phase 1.1a+b; D593 韧性层扩展)
 *
 * 两类入口并存（D593, DSH 借鉴卡 B-02+B-06）:
 *   - callWithRetry — 既有入口，语义冻结（可重试退避重试/不可重试立即抛；tests/llm-resilience.test.ts 锁定）
 *   - callWithResilience — 协作式 outcome 入口（不抛异常；截止超时 = 调用方耐心预算耗尽，
 *     立即结果化不重试——重试不能违背调用方显式给出的 deadline 意图）
 *   - streamWithRetry — 流式入口，idleWatchdog 包流，每个 token pulse 重臂；
 *     空闲超时是传输健康问题（非调用方耐心），按 TIMEOUT 可重试，耗尽才落 TOOL_TIMEOUT 结果
 *
 * 策略解析（DSH retry-policy.js 范式）: resolveRetryPolicy 按
 *   显式 options > provider 注册策略（registerProviderRetryPolicy）> 默认
 * 合并 + schema 校验 fail-fast + Object.freeze（策略解析一次、不可变）。
 * 退避公式（DSH llm-retry localDelay 原样）:
 *   min(initialDelayMs * 2^min(retry-1, 1024), maxDelayMs) * (1 - jitterRatio + 2*jitterRatio*random())
 * 最终再钳到 maxDelayMs（指数溢出安全）。
 *
 * 重试事件: onRetry 回调外抛（L2 消费方可经 store 层 appendRetryEvent 落 D500 事件流——
 * src/llm 不 import src/store，分层解耦经回调缝）。
 *
 * 参考: Hermes agent_runtime_helpers.py:716-795
 */
import type { LLMProvider, ChatResult, ChatOptions, LLMMessage, StreamCallback } from '../providers/types';
import { isRetryableError, computeBackoff, DEFAULT_LLM_CALL_OPTIONS, type LLMCallOptions } from './types';
import { MAX_TIMER_DELAY_MS, TOOL_TIMEOUT_CODE, TimeoutReason, clampTimeout, deadline, idleWatchdog } from './timeout';
import { normalizeLlmFailure } from '../errors/types';
import { createLogger } from '@synova/logger';

const log = createLogger('llm/retry-middleware');

export interface RetryConfig {
  maxRetries?: number;
  totalTimeoutMs?: number;
}

// ═══ 重试策略（D593, DSH retry-policy 范式）═══

/** 策略配置片段（LLMCallOptions 重试子集的独立视图，供 provider 注册与显式覆盖） */
export interface RetryPolicyConfig {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  jitterRatio?: number;
  retryableCodes?: string[];
}

/** 解析后的冻结策略（schema 校验通过；retryableCodes 为只读副本） */
export interface ResolvedRetryPolicy {
  readonly maxRetries: number;
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
  readonly jitterRatio: number;
  readonly retryableCodes: readonly string[];
}

/** provider 级注册策略（重试是 provider 路由属性，非调用点散落参数——DeepSeek 第一性原理） */
const providerRetryPolicies = new Map<string, RetryPolicyConfig>();

/**
 * 注册 provider 级重试策略（覆盖默认；显式 options 再覆盖注册）。
 * @throws 注册值本身非法时延迟到 resolveRetryPolicy 统一 fail-fast（注册不校验，解析才校验）
 */
export function registerProviderRetryPolicy(providerName: string, policy: RetryPolicyConfig): void {
  providerRetryPolicies.set(providerName, { ...policy });
}

/**
 * 解析冻结重试策略: 显式 options > provider 注册策略 > 默认。
 * @input  — options 片段 + providerName（查注册表）
 * @output — Object.freeze 策略；retryableCodes 冻结副本
 * @throws schema 违例（正整数/比例越界/initial>max/码表空·重复·空串）——消息 DSH 范式 `retryPolicy.<field> must ...`
 */
export function resolveRetryPolicy(options?: RetryPolicyConfig & { providerName?: string }): ResolvedRetryPolicy {
  const registered = options?.providerName !== undefined ? providerRetryPolicies.get(options.providerName) : undefined;
  const merged = {
    maxRetries: options?.maxRetries ?? registered?.maxRetries ?? DEFAULT_LLM_CALL_OPTIONS.maxRetries,
    initialDelayMs: options?.initialDelayMs ?? registered?.initialDelayMs ?? DEFAULT_LLM_CALL_OPTIONS.initialDelayMs,
    maxDelayMs: options?.maxDelayMs ?? registered?.maxDelayMs ?? DEFAULT_LLM_CALL_OPTIONS.maxDelayMs,
    jitterRatio: options?.jitterRatio ?? registered?.jitterRatio ?? DEFAULT_LLM_CALL_OPTIONS.jitterRatio,
    retryableCodes: options?.retryableCodes ?? registered?.retryableCodes ?? DEFAULT_LLM_CALL_OPTIONS.retryableCodes,
  };

  if (!Number.isSafeInteger(merged.maxRetries) || merged.maxRetries < 0) {
    throw new Error(`retryPolicy.maxRetries must be a non-negative integer, got ${String(merged.maxRetries)}`);
  }
  for (const field of ['initialDelayMs', 'maxDelayMs'] as const) {
    const value = merged[field];
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`retryPolicy.${field} must be a positive integer, got ${String(value)}`);
    }
  }
  if (!Number.isFinite(merged.jitterRatio) || merged.jitterRatio < 0 || merged.jitterRatio > 1) {
    throw new Error(`retryPolicy.jitterRatio must be a number in [0, 1], got ${String(merged.jitterRatio)}`);
  }
  // 溢出防护: maxDelayMs 钳到 Node 定时器边界（语义是"尽量大"，钳制而非拒绝）
  const maxDelayMs = Math.min(merged.maxDelayMs, MAX_TIMER_DELAY_MS);
  if (merged.initialDelayMs > maxDelayMs) {
    throw new Error(
      `retryPolicy.initialDelayMs must be <= maxDelayMs (${String(maxDelayMs)}), got ${String(merged.initialDelayMs)}`,
    );
  }
  const codes = merged.retryableCodes;
  if (!Array.isArray(codes) || codes.length === 0) {
    throw new Error('retryPolicy.retryableCodes must be a non-empty array of failure codes');
  }
  const seen = new Set<string>();
  for (const code of codes) {
    if (typeof code !== 'string' || code.length === 0) {
      throw new Error('retryPolicy.retryableCodes must contain non-empty strings');
    }
    if (seen.has(code)) {
      throw new Error(`retryPolicy.retryableCodes must not contain duplicates (got ${JSON.stringify(code)})`);
    }
    seen.add(code);
  }

  return Object.freeze({
    maxRetries: merged.maxRetries,
    initialDelayMs: merged.initialDelayMs,
    maxDelayMs,
    jitterRatio: merged.jitterRatio,
    retryableCodes: Object.freeze([...codes]),
  });
}

/**
 * DSH llm-retry localDelay 原样: 指数退避 + 比例抖动 + 双重 maxDelay 封顶。
 * @param retry  — 1-based 重试序号（首次重试 = 1）
 * @param random — 随机源（测试注入确定性）
 */
export function localDelay(policy: ResolvedRetryPolicy, retry: number, random: () => number = Math.random): number {
  const exponent = Math.min(retry - 1, 1024);
  const exponential = Math.min(policy.initialDelayMs * 2 ** exponent, policy.maxDelayMs);
  const jitter = 1 - policy.jitterRatio + 2 * policy.jitterRatio * random();
  return Math.min(exponential * jitter, policy.maxDelayMs);
}

// ═══ 协作式 outcome（不抛异常）═══

/** 失败结果（kind='timeout' 为 TOOL_TIMEOUT 归类；kind='error' 为可重试耗尽或不可重试失败） */
export interface ResilienceFailure {
  ok: false;
  kind: 'timeout' | 'error';
  code: string;
  message: string;
  attempts: number;
  degraded: true;
  retryable: boolean;
}

/** callWithResilience 结果: 成功携带 ChatResult，失败为分类 outcome（永不抛异常） */
export type ResilienceOutcome =
  | { ok: true; result: ChatResult; attempts: number }
  | ResilienceFailure;

/** streamWithRetry 结果: 成功携带尝试数，失败为分类 outcome（永不抛异常） */
export type StreamResilienceOutcome =
  | { ok: true; attempts: number }
  | ResilienceFailure;

/** 重试事件载荷（DSH llm/retry 形态收敛; store 层 appendRetryEvent 经此落 D500 事件流） */
export interface LlmRetryEvent {
  readonly provider: string;
  readonly code: string;
  /** 0-based 失败尝试序号 */
  readonly attempt: number;
  readonly maxRetries: number;
  readonly delayMs: number;
  readonly mode: 'chat' | 'stream';
  readonly message: string;
}

/** 韧性入口选项 = 策略片段 + 超时 + 上游信号 + 重试回调 */
export interface ResilienceOptions extends RetryPolicyConfig {
  /** provider 策略注册名（缺省用 provider.name） */
  providerName?: string;
  totalTimeoutMs?: number;
  idleTimeoutMs?: number;
  signal?: AbortSignal;
  onRetry?: (event: LlmRetryEvent) => void;
}

/** 剥离韧性专属键，只透传 ChatOptions（不向 provider 泄漏策略字段） */
function pickChatOptions(options: (ChatOptions & ResilienceOptions) | undefined, signal: AbortSignal): ChatOptions {
  const chat: ChatOptions = { signal };
  if (options === undefined) return chat;
  if (options.model !== undefined) chat.model = options.model;
  if (options.temperature !== undefined) chat.temperature = options.temperature;
  if (options.maxTokens !== undefined) chat.maxTokens = options.maxTokens;
  if (options.reasoningEffort !== undefined) chat.reasoningEffort = options.reasoningEffort;
  return chat;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 协作式 LLM 调用: 重试 + 截止超时，永不抛异常（outcome 化）。
 * @input  — provider + messages + ResilienceOptions（策略/超时/上游 signal/onRetry）
 * @output — { ok:true, result, attempts } | ResilienceFailure（degraded:true）
 * @degraded — 失败一律 degraded:true；截止超时归类 TOOL_TIMEOUT（不重试——deadline 是调用方意图）；
 *             不可重试失败立即 outcome；可重试耗尽 outcome.retryable=true
 */
export async function callWithResilience(
  provider: LLMProvider,
  messages: Parameters<LLMProvider['chat']>[0],
  options?: ChatOptions & ResilienceOptions,
): Promise<ResilienceOutcome> {
  const policy = resolveRetryPolicy(options);
  const totalMs = clampTimeout(options?.totalTimeoutMs, DEFAULT_LLM_CALL_OPTIONS.totalTimeoutMs);
  const providerName = options?.providerName ?? provider.name;

  for (let attempt = 0; attempt <= policy.maxRetries; attempt++) {
    const dl = deadline(options?.signal, totalMs, TOOL_TIMEOUT_CODE);
    try {
      const result = await provider.chat(messages, pickChatOptions(options, dl.signal));
      dl.dispose();
      if (attempt > 0) {
        log.info({ provider: providerName, attempt, totalAttempts: attempt + 1 }, 'LLM 重试成功');
      }
      return { ok: true, result, attempts: attempt + 1 };
    } catch (err) {
      dl.dispose();

      // 截止超时: 调用方耐心预算耗尽 → 立即结果化（重试不能违背 deadline 意图）
      if (options?.signal?.aborted !== true && dl.signal.aborted) {
        const message = err instanceof Error ? err.message : `TOOL_TIMEOUT after ${String(totalMs)}ms`;
        log.warn({ provider: providerName, timeoutMs: totalMs, attempt }, 'LLM 调用截止超时 — TOOL_TIMEOUT');
        return {
          ok: false, kind: 'timeout', code: TOOL_TIMEOUT_CODE, message,
          attempts: attempt + 1, degraded: true, retryable: false,
        };
      }

      // 失败归一化: 稳定码路由 retryableCodes；无稳定码（'UNKNOWN'）→ 既有 message 兜底分类
      const failure = normalizeLlmFailure(err);
      let retryable = policy.retryableCodes.includes(failure.code);
      if (failure.code === 'UNKNOWN') {
        retryable = err instanceof Error && isRetryableError(err);
      }
      if (!retryable) {
        log.warn({ provider: providerName, code: failure.code, attempt }, '不可重试错误，返回 outcome');
        return {
          ok: false, kind: 'error', code: failure.code, message: failure.message,
          attempts: attempt + 1, degraded: true, retryable: false,
        };
      }
      if (attempt >= policy.maxRetries) {
        log.warn({ provider: providerName, code: failure.code, attempts: attempt + 1 }, '重试耗尽 — 返回 outcome');
        return {
          ok: false, kind: 'error', code: failure.code, message: failure.message,
          attempts: attempt + 1, degraded: true, retryable: true,
        };
      }

      const delayMs = localDelay(policy, attempt + 1);
      options?.onRetry?.({
        provider: providerName, code: failure.code, attempt,
        maxRetries: policy.maxRetries, delayMs, mode: 'chat', message: failure.message,
      });
      log.warn({ provider: providerName, code: failure.code, attempt, delayMs: Math.round(delayMs) },
        `LLM 调用失败，${Math.round(delayMs)}ms 后重试`);
      await sleep(delayMs);
    }
  }
  // 循环每条路径都 return——此行不可达（防御性收口，保持函数总返回 Promise<Outcome>）
  throw new Error('retry loop exited unexpectedly');
}

/**
 * 流式调用: idleWatchdog 包流，每个 token pulse 重臂，永不抛异常（outcome 化）。
 * @input  — provider + messages + onToken + ResilienceOptions（idleTimeoutMs 看门狗窗口）
 * @output — { ok:true, attempts } | ResilienceFailure；空闲耗尽归类 TOOL_TIMEOUT
 * @degraded — 空闲超时按 TIMEOUT 可重试（传输健康问题，非调用方耐心预算）；重试耗尽落
 *             TOOL_TIMEOUT outcome（degraded:true）；provider.stream 异常同 chat 分类路径
 */
export async function streamWithRetry(
  provider: LLMProvider,
  messages: LLMMessage[],
  onToken: (token: string) => void,
  options?: ChatOptions & ResilienceOptions,
): Promise<StreamResilienceOutcome> {
  const policy = resolveRetryPolicy(options);
  const idleMs = clampTimeout(options?.idleTimeoutMs, DEFAULT_LLM_CALL_OPTIONS.idleTimeoutMs);
  const providerName = options?.providerName ?? provider.name;

  for (let attempt = 0; attempt <= policy.maxRetries; attempt++) {
    const wd = idleWatchdog(options?.signal, idleMs, TOOL_TIMEOUT_CODE);
    const pulsingCallback: StreamCallback = {
      onToken: (token: string) => {
        wd.pulse();
        onToken(token);
      },
    };
    try {
      await provider.stream(messages, pulsingCallback, pickChatOptions(options, wd.signal));
      wd.dispose();
      if (attempt > 0) {
        log.info({ provider: providerName, attempt, totalAttempts: attempt + 1 }, '流式重试成功');
      }
      return { ok: true, attempts: attempt + 1 };
    } catch (err) {
      wd.dispose();

      const upstreamAborted = options?.signal?.aborted === true;
      const idleFired = !upstreamAborted && wd.signal.aborted;
      const idleReason = wd.signal.reason;
      const idleMessage = idleReason instanceof TimeoutReason
        ? idleReason.message
        : `TOOL_TIMEOUT after ${String(idleMs)}ms`;

      if (idleFired && attempt < policy.maxRetries && policy.retryableCodes.includes('TIMEOUT')) {
        const delayMs = localDelay(policy, attempt + 1);
        options?.onRetry?.({
          provider: providerName, code: TOOL_TIMEOUT_CODE, attempt,
          maxRetries: policy.maxRetries, delayMs, mode: 'stream', message: idleMessage,
        });
        log.warn({ provider: providerName, idleMs, attempt, delayMs: Math.round(delayMs) },
          `流空闲超时，${Math.round(delayMs)}ms 后重试`);
        await sleep(delayMs);
        continue;
      }
      if (idleFired) {
        log.warn({ provider: providerName, idleMs, attempt }, '流空闲超时且不重试 — TOOL_TIMEOUT');
        return {
          ok: false, kind: 'timeout', code: TOOL_TIMEOUT_CODE, message: idleMessage,
          attempts: attempt + 1, degraded: true, retryable: true,
        };
      }

      const failure = normalizeLlmFailure(err);
      let retryable = policy.retryableCodes.includes(failure.code);
      if (failure.code === 'UNKNOWN') {
        retryable = err instanceof Error && isRetryableError(err);
      }
      if (!retryable || attempt >= policy.maxRetries) {
        log.warn({ provider: providerName, code: failure.code, attempt, retryable }, '流式失败 — 返回 outcome');
        return {
          ok: false, kind: 'error', code: failure.code, message: failure.message,
          attempts: attempt + 1, degraded: true, retryable,
        };
      }

      const delayMs = localDelay(policy, attempt + 1);
      options?.onRetry?.({
        provider: providerName, code: failure.code, attempt,
        maxRetries: policy.maxRetries, delayMs, mode: 'stream', message: failure.message,
      });
      log.warn({ provider: providerName, code: failure.code, attempt, delayMs: Math.round(delayMs) },
        `流式调用失败，${Math.round(delayMs)}ms 后重试`);
      await sleep(delayMs);
    }
  }
  // 循环每条路径都 return——此行不可达（防御性收口）
  throw new Error('retry loop exited unexpectedly');
}

// ═══ 既有入口（语义冻结 — tests/llm-resilience.test.ts 锁定契约）═══

/**
 * 包装 LLMProvider.chat() — 加重试 + 超时。
 * 认证错误 (401/403) 不重试。网络/服务端错误指数退避。
 */
export async function callWithRetry(
  provider: LLMProvider,
  messages: Parameters<LLMProvider['chat']>[0],
  options?: ChatOptions & RetryConfig,
): Promise<ChatResult> {
  const maxRetries = options?.maxRetries ?? DEFAULT_LLM_CALL_OPTIONS.maxRetries;
  const totalTimeoutMs = options?.totalTimeoutMs ?? DEFAULT_LLM_CALL_OPTIONS.totalTimeoutMs;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // TimeoutGuard: AbortSignal.timeout
      const signal = options?.signal ?? AbortSignal.timeout(totalTimeoutMs);

      const result = await provider.chat(messages, {
        ...options,
        signal,
      });

      // Success — log if retries were needed
      if (attempt > 0) {
        log.info({ attempt, totalAttempts: attempt + 1 }, 'LLM 重试成功');
      }
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      log.warn({ err: error.message }, 'LLM 请求超时等待');
      lastError = error;

      // 不可重试 → 立即抛
      if (!isRetryableError(error)) {
        log.warn({ err: error.message, attempt }, '不可重试错误，立即返回');
        throw err;
      }

      // 可重试但已达上限
      if (attempt >= maxRetries) {
        log.error({ err: error.message, attempts: attempt + 1 }, '重试耗尽');
        throw err;
      }

      // 计算退避延迟
      const delay = computeBackoff(attempt, DEFAULT_LLM_CALL_OPTIONS);
      log.warn({ err: error.message, attempt, delayMs: Math.round(delay) },
        `LLM 调用失败，${Math.round(delay)}ms 后重试`);

      await sleep(delay);
    }
  }

  // Should never reach here, but just in case
  throw lastError || new Error('LLM 调用失败');
}
