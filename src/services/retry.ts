/**
 * services/retry.ts — 通用指数退避重试 (P2: 连接器自动重试)
 *
 * 复用 ExpertDispatcher.runWithRetry 的成熟模式，提取为独立服务。
 * 用于: connector-pipeline, LLM calls, external API calls
 */

import { createLogger } from '@synova/logger';

const log = createLogger('services/retry');

export interface RetryOptions {
  /** 最大重试次数 (default 3) */
  maxRetries?: number;
  /** 基础延迟 ms (default 2000) */
  baseDelayMs?: number;
  /** 最大延迟 ms (default 16000) */
  maxDelayMs?: number;
  /** 判定可重试 — 返回 true 则重试 */
  isRetryable?: (err: Error) => boolean;
  /** 操作标签 (日志用) */
  label?: string;
}

/**
 * 执行带指数退避重试的异步操作。
 *
 * 网络错误 (timeout/network/econnrefused/etimedout/5xx) 自动重试。
 * 延迟公式: min(baseDelay * 2^attempt, maxDelay)
 *
 * @example
 * const result = await withRetry(() => fetch(url), { label: 'connector-sync' });
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 2000,
    maxDelayMs = 16000,
    isRetryable,
    label = 'retry',
  } = opts;

  const defaultIsRetryable = (err: Error): boolean =>
    /timeout|network|econnrefused|etimedout|enotfound|eaddrinuse|5\d{2}/i.test(err.message);

  const shouldRetry = isRetryable ?? defaultIsRetryable;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      log.warn({ err: err instanceof Error ? err.message : String(err) }, "重试任务执行");
      const error = err instanceof Error ? err : new Error(String(err));

      if (attempt < maxRetries && shouldRetry(error)) {
        const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
        log.debug({ label, attempt, delay: `${delay}ms`, error: error.message },
          '操作失败 — 指数退避重试');
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw error;
    }
  }

  // unreachable — TypeScript requires return
  throw new Error('withRetry: unreachable');
}
