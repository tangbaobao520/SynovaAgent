/**
 * errors/types.ts — 类型化错误 + 重试策略
 *
 * 铁律 32: 每个 catch 块必须返回带 .code 的类型化 Error 子类。
 * 上层根据 error.code 做差异化恢复。
 */

// ═══ Error Codes ═══

export const ErrorCode = {
  // Network
  TIMEOUT: 'TIMEOUT',
  NETWORK: 'NETWORK',
  DNS: 'DNS',
  // Auth
  AUTH_FAILED: 'AUTH_FAILED',
  RATE_LIMITED: 'RATE_LIMITED',
  // Input
  INVALID_INPUT: 'INVALID_INPUT',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  // Engine
  ENGINE_UNAVAILABLE: 'ENGINE_UNAVAILABLE',
  ENGINE_TIMEOUT: 'ENGINE_TIMEOUT',
  MODULE_FAILED: 'MODULE_FAILED',
  // Data
  DB_ERROR: 'DB_ERROR',
  CORRUPTED_DATA: 'CORRUPTED_DATA',
  // Unknown
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

// ═══ Error Class ═══

export class DiagnosticAgentError extends Error {
  readonly code: ErrorCodeType;
  readonly phase: number;
  readonly retryable: boolean;
  readonly cause?: unknown;

  constructor(code: ErrorCodeType, message: string, phase: number, retryable: boolean, cause?: unknown) {
    super(message);
    this.name = 'DiagnosticAgentError';
    this.code = code;
    this.phase = phase;
    this.retryable = retryable;
    this.cause = cause;
  }
}

// ═══ Retry Strategy ═══

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30_000,
  backoffMultiplier: 2,
};

/** Determine if an error is retryable based on its code */
export function isRetryable(code: ErrorCodeType): boolean {
  switch (code) {
    case ErrorCode.TIMEOUT:
    case ErrorCode.NETWORK:
    case ErrorCode.DNS:
    case ErrorCode.RATE_LIMITED:
    case ErrorCode.ENGINE_TIMEOUT:
    case ErrorCode.DB_ERROR:
      return true;
    case ErrorCode.AUTH_FAILED:
    case ErrorCode.INVALID_INPUT:
    case ErrorCode.VALIDATION_FAILED:
    case ErrorCode.ENGINE_UNAVAILABLE:
    case ErrorCode.MODULE_FAILED:
    case ErrorCode.CORRUPTED_DATA:
    case ErrorCode.INTERNAL:
      return false;
  }
}

/** Execute a function with retry + exponential backoff */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
): Promise<T> {
  const cfg = { ...DEFAULT_RETRY, ...config };
  let lastError: unknown;

  for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      if (attempt === cfg.maxRetries) break;

      const retryable = err instanceof DiagnosticAgentError ? err.retryable : false;
      if (!retryable) throw err;

      const delay = Math.min(cfg.baseDelayMs * Math.pow(cfg.backoffMultiplier, attempt), cfg.maxDelayMs);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  throw lastError;
}
