/**
 * llm/types.ts — LLM 调用韧性层配置 (Phase 1.1)
 *
 * 参考: Hermes agent_init.py:1204-1212 (api_max_retries=3)
 *       Hermes mcp_tool.py:1739-1740 (CIRCUIT_BREAKER_THRESHOLD=3, COOLDOWN=60s)
 *       OpenClaw tool-loop-detection.ts (global_circuit_breaker_threshold=30)
 */

/** 可重试的 HTTP 状态码 */
export const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

/** 瞬态网络错误消息片段 (参考 Hermes _TRANSIENT_TRANSPORT_ERRORS) */
export const TRANSIENT_ERROR_PATTERNS = [
  'ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET',
  'ENOTFOUND', 'EPIPE', 'ERR_HTTP2_SOCKET',
  'fetch failed', 'network timeout',
];

/** Circuit breaker 状态 */
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/** LLM 调用统一配置 */
export interface LLMCallOptions {
  /** 首 token 超时 (ms), 默认 15_000 */
  firstTokenTimeoutMs?: number;
  /** 总超时 (ms), 默认 120_000 */
  totalTimeoutMs?: number;
  /** 最大重试次数, 默认 3 */
  maxRetries?: number;
  /** 退避基数 (ms), 默认 1000 */
  backoffBaseMs?: number;
  /** 退避倍数, 默认 2 (指数) */
  backoffMultiplier?: number;
  /** 最大退避时间 (ms), 默认 16_000 */
  maxBackoffMs?: number;
  /** 熔断阈值 (连续失败次数), 默认 3 */
  circuitBreakerThreshold?: number;
  /** 熔断冷却时间 (ms), 默认 60_000 */
  circuitBreakerCooldownMs?: number;
}

export const DEFAULT_LLM_CALL_OPTIONS: Required<LLMCallOptions> = {
  firstTokenTimeoutMs: 15_000,
  totalTimeoutMs: 120_000,
  maxRetries: 3,
  backoffBaseMs: 1_000,
  backoffMultiplier: 2,
  maxBackoffMs: 16_000,
  circuitBreakerThreshold: 3,
  circuitBreakerCooldownMs: 60_000,
};

/** 判断错误是否可重试 */
export function isRetryableError(err: Error): boolean {
  // HTTP 状态码错误 (message 含状态码)
  for (const code of RETRYABLE_STATUS_CODES) {
    if (err.message.includes(`${code}`)) return true;
  }
  // 瞬态网络错误
  return TRANSIENT_ERROR_PATTERNS.some(p =>
    err.message.toLowerCase().includes(p.toLowerCase()) ||
    err.name.toLowerCase().includes(p.toLowerCase()),
  );
}

/** 计算指数退避延迟 */
export function computeBackoff(retryCount: number, opts: Required<LLMCallOptions>): number {
  const delay = opts.backoffBaseMs * Math.pow(opts.backoffMultiplier, retryCount);
  // 加 jitter (±20%) — 避免惊群效应
  const jitter = delay * 0.2 * (Math.random() * 2 - 1);
  return Math.min(delay + jitter, opts.maxBackoffMs);
}
