/**
 * llm/retry-middleware.ts — LLM 重试 + 超时中间件 (Phase 1.1a+b)
 *
 * 包装 provider.chat():
 *   1. TimeoutGuard — AbortSignal.timeout 强制超时
 *   2. RetryMiddleware — 指数退避重试 (1s, 2s, 4s, 8s, 16s)
 *
 * 参考: Hermes agent_runtime_helpers.py:716-795
 *   _TRANSIENT_TRANSPORT_ERRORS + try_recover_primary_transport()
 *   backoff: min(3+retry_count, 8) seconds
 */
import type { LLMProvider, ChatResult, ChatOptions } from '../providers/types';
import { isRetryableError, computeBackoff, DEFAULT_LLM_CALL_OPTIONS } from './types';
import { createLogger } from '@synova/logger';

const log = createLogger('llm/retry-middleware');

export interface RetryConfig {
  maxRetries?: number;
  totalTimeoutMs?: number;
}

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
    } catch (err: any) {
      lastError = err;

      // 不可重试 → 立即抛
      if (!isRetryableError(err)) {
        log.warn({ err: err.message, attempt }, '不可重试错误，立即返回');
        throw err;
      }

      // 可重试但已达上限
      if (attempt >= maxRetries) {
        log.error({ err: err.message, attempts: attempt + 1 }, '重试耗尽');
        throw err;
      }

      // 计算退避延迟
      const delay = computeBackoff(attempt, DEFAULT_LLM_CALL_OPTIONS);
      log.warn({ err: err.message, attempt, delayMs: Math.round(delay) },
        `LLM 调用失败，${Math.round(delay)}ms 后重试`);

      await sleep(delay);
    }
  }

  // Should never reach here, but just in case
  throw lastError || new Error('LLM 调用失败');
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
