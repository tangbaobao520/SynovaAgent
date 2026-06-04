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
  AUTH_PERMANENT: 'AUTH_PERMANENT',      // Hermes: 凭据彻底失效 (401 after refresh)
  RATE_LIMITED: 'RATE_LIMITED',
  // Input
  INVALID_INPUT: 'INVALID_INPUT',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  CONTEXT_OVERFLOW: 'CONTEXT_OVERFLOW',  // Hermes: 上下文超长 → 触发压缩重试
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE', // Hermes: 请求体过大 → 压缩后重试
  // Engine
  ENGINE_UNAVAILABLE: 'ENGINE_UNAVAILABLE',
  ENGINE_TIMEOUT: 'ENGINE_TIMEOUT',
  MODULE_FAILED: 'MODULE_FAILED',
  // Model
  MODEL_NOT_FOUND: 'MODEL_NOT_FOUND',     // Hermes: 模型不可用 → 回退其他模型
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE', // Hermes: 提供者不可用 (503/529)
  // Billing
  BILLING_EXCEEDED: 'BILLING_EXCEEDED',   // Hermes: 计费超限 (402)
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
    // Retryable — 短暂故障，重试可恢复
    case ErrorCode.TIMEOUT:
    case ErrorCode.NETWORK:
    case ErrorCode.DNS:
    case ErrorCode.RATE_LIMITED:
    case ErrorCode.ENGINE_TIMEOUT:
    case ErrorCode.DB_ERROR:
    case ErrorCode.PROVIDER_UNAVAILABLE:     // 503/529 → 重试其他 provider
    case ErrorCode.CONTEXT_OVERFLOW:         // 压缩后可重试
    case ErrorCode.PAYLOAD_TOO_LARGE:        // 压缩后可重试
    case ErrorCode.AUTH_FAILED:              // 可重试 (换凭据)
      return true;
    // Non-retryable — 需人工介入或永久失败
    case ErrorCode.AUTH_PERMANENT:           // 凭据彻底失效
    case ErrorCode.BILLING_EXCEEDED:         // 计费超限
    case ErrorCode.MODEL_NOT_FOUND:          // 模型不可用 → 回退而非重试
    case ErrorCode.INVALID_INPUT:
    case ErrorCode.VALIDATION_FAILED:
    case ErrorCode.ENGINE_UNAVAILABLE:
    case ErrorCode.MODULE_FAILED:
    case ErrorCode.CORRUPTED_DATA:
    case ErrorCode.INTERNAL:
      return false;
  }
}

/** Get recommended backoff delay based on error type */
export function getBackoffForError(code: ErrorCodeType, attempt: number): number {
  switch (code) {
    case ErrorCode.RATE_LIMITED:
      // 更长的退避: 5s → 20s → 80s (capped 120s)
      return Math.min(5000 * Math.pow(4, attempt), 120_000);
    case ErrorCode.PROVIDER_UNAVAILABLE:
      // Provider 故障: 2s → 4s → 8s
      return Math.min(2000 * Math.pow(2, attempt), 30_000);
    default:
      return Math.min(1000 * Math.pow(2, attempt), 30_000);
  }
}

/** Execute a function with retry + exponential backoff (Hermes: per-error strategies) */
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
      const diagErr = err instanceof DiagnosticAgentError ? err : null;
      const code = diagErr?.code || ErrorCode.INTERNAL;

      // CONTEXT_OVERFLOW: 不重试, 应触发压缩后重新调用
      if (code === ErrorCode.CONTEXT_OVERFLOW && attempt === 0) {
        throw err; // Caller should catch, compress, retry
      }
      // AUTH_PERMANENT / BILLING_EXCEEDED: 不再重试
      if (code === ErrorCode.AUTH_PERMANENT || code === ErrorCode.BILLING_EXCEEDED) {
        throw err;
      }

      if (attempt === cfg.maxRetries) break;

      const retryable = diagErr ? diagErr.retryable : false;
      if (!retryable) throw err;

      const delay = getBackoffForError(code, attempt);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  throw lastError;
}
