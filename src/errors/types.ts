/**
 * errors/types.ts — 类型化错误 + 分类流水线 + 恢复策略
 *
 * 铁律 32: 每个 catch 块必须返回带 .code 的类型化 Error 子类。
 * 参考 Hermes error_classifier.py: 8 阶段优先级分类流水线 + 模式匹配 + 恢复动作提示。
 *
 * Hermes 关键设计:
 *   - 分类流水线: 提供者特定 → HTTP 状态码 → 错误码 → 消息模式 → SSL → 断连 → 传输 → 兜底
 *   - 恢复动作提示: retryable / shouldCompress / shouldRotateCredential / shouldFallback
 *   - 模式匹配: 30+ 模式库，消息感知区分 billing vs rate_limit vs context_overflow
 *   - Jittered backoff: 去抖退避防止雷群效应
 */
import * as crypto from 'crypto';

// ═══ Error Codes (Hermes FailoverReason 对齐) ═══

export const ErrorCode = {
  // Transport
  TIMEOUT: 'TIMEOUT',
  NETWORK: 'NETWORK',
  DNS: 'DNS',

  // Auth (Hermes: auth / auth_permanent)
  AUTH_FAILED: 'AUTH_FAILED',
  AUTH_PERMANENT: 'AUTH_PERMANENT',

  // Rate / Billing
  RATE_LIMITED: 'RATE_LIMITED',
  BILLING_EXCEEDED: 'BILLING_EXCEEDED',

  // Server-side
  OVERLOADED: 'OVERLOADED',               // Hermes: 503/529
  SERVER_ERROR: 'SERVER_ERROR',           // Hermes: 500/502
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',

  // Input / Format
  INVALID_INPUT: 'INVALID_INPUT',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  FORMAT_ERROR: 'FORMAT_ERROR',           // Hermes: 400 malformed → 不回退重试

  // Context
  CONTEXT_OVERFLOW: 'CONTEXT_OVERFLOW',   // Hermes: context too large → compress
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE', // Hermes: 413 → compress

  // Model / Provider
  MODEL_NOT_FOUND: 'MODEL_NOT_FOUND',
  CONTENT_POLICY_BLOCKED: 'CONTENT_POLICY_BLOCKED', // Hermes: safety filter → fallback

  // Engine
  ENGINE_UNAVAILABLE: 'ENGINE_UNAVAILABLE',
  ENGINE_TIMEOUT: 'ENGINE_TIMEOUT',
  MODULE_FAILED: 'MODULE_FAILED',

  // Data
  DB_ERROR: 'DB_ERROR',
  CORRUPTED_DATA: 'CORRUPTED_DATA',

  // Catch-all
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

// ═══ Classified Error (Hermes ClassifiedError dataclass) ═══

export class DiagnosticAgentError extends Error {
  readonly code: ErrorCodeType;
  readonly phase: number;
  readonly retryable: boolean;
  /** Hermes: should trigger context compression before retry */
  readonly shouldCompress: boolean;
  /** Hermes: should rotate to next credential in pool */
  readonly shouldRotateCredential: boolean;
  /** Hermes: should fallback to alternative provider/model */
  readonly shouldFallback: boolean;
  readonly cause?: unknown;
  readonly statusCode?: number;
  readonly provider?: string;
  readonly model?: string;

  // New API: options object
  constructor(opts: {
    code: ErrorCodeType; message: string; phase: number; retryable: boolean;
    shouldCompress?: boolean; shouldRotateCredential?: boolean; shouldFallback?: boolean;
    cause?: unknown; statusCode?: number; provider?: string; model?: string;
  });
  // Backward-compat: old positional API (code, message, phase, retryable)
  constructor(code: ErrorCodeType, message: string, phase: number, retryable: boolean);
  constructor(
    codeOrOpts: ErrorCodeType | {
      code: ErrorCodeType; message: string; phase: number; retryable: boolean;
      shouldCompress?: boolean; shouldRotateCredential?: boolean; shouldFallback?: boolean;
      cause?: unknown; statusCode?: number; provider?: string; model?: string;
    },
    message?: string, phase?: number, retryable?: boolean,
  ) {
    let code: ErrorCodeType; let msg: string; let ph: number; let retry: boolean;
    let compress = false; let rotate = false; let fallback = false;
    let cause: unknown; let status: number | undefined; let prov: string | undefined; let mod: string | undefined;

    if (typeof codeOrOpts === 'object') {
      code = codeOrOpts.code; msg = codeOrOpts.message; ph = codeOrOpts.phase; retry = codeOrOpts.retryable;
      compress = codeOrOpts.shouldCompress ?? false; rotate = codeOrOpts.shouldRotateCredential ?? false;
      fallback = codeOrOpts.shouldFallback ?? false; cause = codeOrOpts.cause; status = codeOrOpts.statusCode;
      prov = codeOrOpts.provider; mod = codeOrOpts.model;
    } else {
      code = codeOrOpts; msg = message!; ph = phase!; retry = retryable!;
    }

    super(msg);
    this.name = 'DiagnosticAgentError';
    this.code = code; this.phase = ph; this.retryable = retry;
    this.shouldCompress = compress; this.shouldRotateCredential = rotate; this.shouldFallback = fallback;
    this.cause = cause; this.statusCode = status; this.provider = prov; this.model = mod;
  }
}

// ═══ Pattern Banks (Hermes 消息感知模式匹配) ═══

const BILLING_PATTERNS = [
  'insufficient credits', 'insufficient_quota', 'insufficient balance',
  'credit balance', 'credits exhausted', 'credits have been exhausted',
  'no usable credits', 'top up your credits', 'payment required',
  'billing hard limit', 'exceeded your current quota',
  'account is deactivated', 'plan does not include',
  'out of funds', 'run out of funds', 'balance_depleted',
  'model_not_supported_on_free_tier', 'not available on the free tier',
  'key limit exceeded', 'spending limit',
];

const RATE_LIMIT_PATTERNS = [
  'rate limit', 'rate_limit', 'too many requests', 'throttled',
  'requests per minute', 'tokens per minute', 'requests per day',
  'try again in', 'please retry after', 'resource_exhausted',
  'throttlingexception', 'too many concurrent requests',
  'servicequotaexceededexception',
];

const USAGE_LIMIT_PATTERNS = [
  'usage limit', 'quota', 'limit exceeded', 'key limit exceeded',
];

const USAGE_LIMIT_TRANSIENT_SIGNALS = [
  'try again', 'retry', 'resets at', 'reset in', 'wait',
  'requests remaining', 'periodic', 'window',
];

const CONTEXT_OVERFLOW_PATTERNS = [
  'context length', 'context size', 'maximum context', 'token limit',
  'too many tokens', 'reduce the length', 'exceeds the limit',
  'context window', 'prompt is too long', 'prompt exceeds max length',
  'max_tokens', 'maximum number of tokens', 'exceeds the max_model_len',
  'max_model_len', 'prompt length', 'input is too long',
  'maximum model length', 'context length exceeded',
  'slot context', 'n_ctx_slot',
  '超过最大长度', '上下文长度',
  'input is too long', 'max input token', 'input token',
];

const MODEL_NOT_FOUND_PATTERNS = [
  'is not a valid model', 'invalid model', 'model not found',
  'model_not_found', 'does not exist', 'no such model',
  'unknown model', 'unsupported model',
];

const AUTH_PATTERNS = [
  'invalid api key', 'invalid_api_key', 'authentication',
  'unauthorized', 'forbidden', 'invalid token', 'token expired',
  'token revoked', 'access denied',
];

const CONTENT_POLICY_BLOCKED_PATTERNS = [
  'flagged for possible cybersecurity risk',
  'violates our usage policies',
  'violates openai\'s usage policies',
  'your request was flagged by',
  'prompt was flagged by our safety',
  'content_filter',
  'responsibleaipolicyviolation',
];

const TIMEOUT_MESSAGE_PATTERNS = [
  'timed out', 'turn timed out', 'request timed out',
  'deadline exceeded', 'operation timed out', 'upstream timed out',
];

const TRANSPORT_ERROR_TYPES = new Set([
  'ReadTimeout', 'ConnectTimeout', 'PoolTimeout',
  'ConnectError', 'RemoteProtocolError',
  'ConnectionError', 'ConnectionResetError',
  'ConnectionAbortedError', 'BrokenPipeError',
  'TimeoutError', 'ReadError', 'ServerDisconnectedError',
  'SSLError', 'SSLZeroReturnError', 'SSLWantReadError',
  'SSLWantWriteError', 'SSLEOFError', 'SSLSyscallError',
  'APIConnectionError', 'APITimeoutError',
]);

const SERVER_DISCONNECT_PATTERNS = [
  'server disconnected', 'peer closed connection',
  'connection reset by peer', 'connection was closed',
  'network connection lost', 'unexpected eof', 'incomplete chunked read',
];

// ═══ Classification Pipeline (Hermes classify_api_error) ═══

export interface ClassifyInput {
  error: Error;
  provider?: string;
  model?: string;
  approxTokens?: number;
  contextLength?: number;
  numMessages?: number;
}

/**
 * Hermes 8-stage priority classification pipeline.
 *
 * Stage 1: Provider-specific patterns
 * Stage 2: HTTP status code + message-aware refinement
 * Stage 3: Structured error code from body
 * Stage 4: Message pattern matching
 * Stage 5: SSL/TLS transient → timeout
 * Stage 6: Server disconnect + large session → context overflow
 * Stage 7: Transport error heuristics
 * Stage 8: Fallback → unknown (retryable)
 */
export function classifyApiError(input: ClassifyInput): DiagnosticAgentError {
  const { error, provider = '', model = '', approxTokens = 0, contextLength = 200_000, numMessages = 0 } = input;
  const statusCode = extractStatusCode(error);
  const errorType = error.constructor.name;
  const body = extractErrorBody(error);
  const errorCode = extractErrorCode(body);
  const errorMsg = buildErrorMessage(error, body);
  const providerLower = provider.toLowerCase();

  const diag = (code: ErrorCodeType, overrides: Partial<{
    retryable: boolean; shouldCompress: boolean;
    shouldRotateCredential: boolean; shouldFallback: boolean;
    message: string;
  }> = {}) => new DiagnosticAgentError({
    code, phase: 0,
    message: overrides.message || errorMsg || error.message,
    retryable: overrides.retryable ?? true,
    shouldCompress: overrides.shouldCompress ?? false,
    shouldRotateCredential: overrides.shouldRotateCredential ?? false,
    shouldFallback: overrides.shouldFallback ?? false,
    cause: error, statusCode, provider, model,
  });

  // ── Stage 1: Content policy block (before status check) ──
  if (matchAny(errorMsg, CONTENT_POLICY_BLOCKED_PATTERNS)) {
    return diag(ErrorCode.CONTENT_POLICY_BLOCKED, { retryable: false, shouldFallback: true });
  }

  // ── Stage 2: HTTP status code + message-aware refinement ──
  if (statusCode != null) {
    const classified = classifyByStatus(statusCode, errorMsg, errorCode, approxTokens, contextLength, numMessages, diag);
    if (classified) return classified;
  }

  // ── Stage 3: Structured error code ──
  if (errorCode) {
    const classified = classifyByErrorCode(errorCode, diag);
    if (classified) return classified;
  }

  // ── Stage 4: Message pattern matching ──
  const classified = classifyByMessage(errorMsg, errorType, approxTokens, contextLength, diag);
  if (classified) return classified;

  // ── Stage 5: SSL/TLS transient → timeout ──
  if (matchAny(errorMsg, ['bad record mac', 'ssl alert', 'tls alert', 'ssl handshake failure',
    'bad_record_mac', 'ssl_alert', 'tls_alert', '[ssl:'])) {
    return diag(ErrorCode.TIMEOUT);
  }

  // ── Stage 6: Server disconnect + large session → context overflow ──
  const isDisconnect = matchAny(errorMsg, SERVER_DISCONNECT_PATTERNS);
  if (isDisconnect && !statusCode) {
    const isLarge = approxTokens > contextLength * 0.6
      || (contextLength <= 256_000 && (approxTokens > 120_000 || numMessages > 200));
    if (isLarge) return diag(ErrorCode.CONTEXT_OVERFLOW, { shouldCompress: true });
    return diag(ErrorCode.TIMEOUT);
  }

  // ── Stage 7: Transport heuristics ──
  if (TRANSPORT_ERROR_TYPES.has(errorType) || error instanceof Error && error.name === 'TimeoutError' ||
      (typeof error === 'object' && error !== null &&
       (error instanceof TypeError || /connect|timeout/i.test(String(error))))) {
    return diag(ErrorCode.TIMEOUT);
  }

  // ── Stage 8: Unknown ──
  return diag(ErrorCode.INTERNAL);
}

// ── Status code classification (Hermes _classify_by_status) ──

function classifyByStatus(
  statusCode: number, errorMsg: string, errorCode: string,
  approxTokens: number, contextLength: number, numMessages: number,
  diag: (code: ErrorCodeType, o?: Partial<{ retryable: boolean; shouldCompress: boolean; shouldRotateCredential: boolean; shouldFallback: boolean; message: string }>) => DiagnosticAgentError,
): DiagnosticAgentError | null {
  if (statusCode === 401) {
    return diag(ErrorCode.AUTH_FAILED, { retryable: false, shouldRotateCredential: true, shouldFallback: true });
  }
  if (statusCode === 403) {
    if (matchAny(errorMsg, BILLING_PATTERNS)) {
      return diag(ErrorCode.BILLING_EXCEEDED, { retryable: false, shouldRotateCredential: true, shouldFallback: true });
    }
    return diag(ErrorCode.AUTH_FAILED, { retryable: false, shouldFallback: true });
  }
  if (statusCode === 402) {
    const r402 = _classify402(errorMsg); return diag(r402.code, { retryable: r402.retryable, shouldRotateCredential: r402.shouldRotateCredential, shouldFallback: r402.shouldFallback });
  }
  if (statusCode === 429) {
    return diag(ErrorCode.RATE_LIMITED, { shouldRotateCredential: true, shouldFallback: true });
  }
  if (statusCode === 413) {
    return diag(ErrorCode.PAYLOAD_TOO_LARGE, { shouldCompress: true });
  }
  if (statusCode === 404) {
    if (matchAny(errorMsg, BILLING_PATTERNS)) {
      return diag(ErrorCode.BILLING_EXCEEDED, { retryable: false, shouldRotateCredential: true, shouldFallback: true });
    }
    if (matchAny(errorMsg, MODEL_NOT_FOUND_PATTERNS)) {
      return diag(ErrorCode.MODEL_NOT_FOUND, { retryable: false, shouldFallback: true });
    }
    return diag(ErrorCode.INTERNAL);
  }
  if (statusCode === 400) {
    if (matchAny(errorMsg, CONTEXT_OVERFLOW_PATTERNS)) {
      return diag(ErrorCode.CONTEXT_OVERFLOW, { shouldCompress: true });
    }
    if (matchAny(errorMsg, MODEL_NOT_FOUND_PATTERNS)) {
      return diag(ErrorCode.MODEL_NOT_FOUND, { retryable: false, shouldFallback: true });
    }
    if (matchAny(errorMsg, RATE_LIMIT_PATTERNS)) {
      return diag(ErrorCode.RATE_LIMITED, { shouldRotateCredential: true, shouldFallback: true });
    }
    if (matchAny(errorMsg, BILLING_PATTERNS)) {
      return diag(ErrorCode.BILLING_EXCEEDED, { retryable: false, shouldRotateCredential: true, shouldFallback: true });
    }
    // Generic 400 + large session → probable context overflow
    const isLarge = approxTokens > contextLength * 0.4
      || (contextLength <= 256_000 && (approxTokens > 80_000 || numMessages > 80));
    if (isLarge && errorMsg.length < 50) {
      return diag(ErrorCode.CONTEXT_OVERFLOW, { shouldCompress: true });
    }
    return diag(ErrorCode.FORMAT_ERROR, { retryable: false, shouldFallback: true });
  }
  if (statusCode === 500 || statusCode === 502) {
    return diag(ErrorCode.SERVER_ERROR);
  }
  if (statusCode === 503 || statusCode === 529) {
    return diag(ErrorCode.OVERLOADED);
  }
  // Other 4xx
  if (statusCode >= 400 && statusCode < 500) {
    return diag(ErrorCode.FORMAT_ERROR, { retryable: false, shouldFallback: true });
  }
  // Other 5xx
  if (statusCode >= 500 && statusCode < 600) {
    return diag(ErrorCode.SERVER_ERROR);
  }
  return null;
}

// ── 402 disambiguation (Hermes _classify_402) ──

function _classify402(errorMsg: string): { code: ErrorCodeType; retryable: boolean; shouldRotateCredential: boolean; shouldFallback: boolean } {
  const hasUsageLimit = matchAny(errorMsg, USAGE_LIMIT_PATTERNS);
  const hasTransient = matchAny(errorMsg, USAGE_LIMIT_TRANSIENT_SIGNALS);
  if (hasUsageLimit && hasTransient) {
    return { code: ErrorCode.RATE_LIMITED, retryable: true, shouldRotateCredential: true, shouldFallback: true };
  }
  return { code: ErrorCode.BILLING_EXCEEDED, retryable: false, shouldRotateCredential: true, shouldFallback: true };
}

// ── Error code classification (Hermes _classify_by_error_code) ──

function classifyByErrorCode(
  errorCode: string,
  diag: (c: ErrorCodeType, o?: any) => DiagnosticAgentError,
): DiagnosticAgentError | null {
  const c = errorCode.toLowerCase();
  if (['resource_exhausted', 'throttled', 'rate_limit_exceeded'].includes(c)) {
    return diag(ErrorCode.RATE_LIMITED, { shouldRotateCredential: true });
  }
  if (['insufficient_quota', 'billing_not_active', 'payment_required', 'insufficient_credits', 'no_usable_credits', 'balance_depleted'].includes(c)) {
    return diag(ErrorCode.BILLING_EXCEEDED, { retryable: false, shouldRotateCredential: true, shouldFallback: true });
  }
  if (['model_not_found', 'model_not_available', 'invalid_model'].includes(c)) {
    return diag(ErrorCode.MODEL_NOT_FOUND, { retryable: false, shouldFallback: true });
  }
  if (['context_length_exceeded', 'max_tokens_exceeded'].includes(c)) {
    return diag(ErrorCode.CONTEXT_OVERFLOW, { shouldCompress: true });
  }
  return null;
}

// ── Message pattern classification (Hermes _classify_by_message) ──

function classifyByMessage(
  errorMsg: string, errorType: string,
  approxTokens: number, contextLength: number,
  diag: (c: ErrorCodeType, o?: any) => DiagnosticAgentError,
): DiagnosticAgentError | null {
  // Usage limit disambiguation (same as 402)
  const hasUsageLimit = matchAny(errorMsg, USAGE_LIMIT_PATTERNS);
  if (hasUsageLimit) {
    const hasTransient = matchAny(errorMsg, USAGE_LIMIT_TRANSIENT_SIGNALS);
    if (hasTransient) {
      return diag(ErrorCode.RATE_LIMITED, { shouldRotateCredential: true, shouldFallback: true });
    }
    return diag(ErrorCode.BILLING_EXCEEDED, { retryable: false, shouldRotateCredential: true, shouldFallback: true });
  }
  if (matchAny(errorMsg, BILLING_PATTERNS)) {
    return diag(ErrorCode.BILLING_EXCEEDED, { retryable: false, shouldRotateCredential: true, shouldFallback: true });
  }
  if (matchAny(errorMsg, RATE_LIMIT_PATTERNS)) {
    return diag(ErrorCode.RATE_LIMITED, { shouldRotateCredential: true, shouldFallback: true });
  }
  if (matchAny(errorMsg, CONTEXT_OVERFLOW_PATTERNS)) {
    return diag(ErrorCode.CONTEXT_OVERFLOW, { shouldCompress: true });
  }
  if (matchAny(errorMsg, AUTH_PATTERNS)) {
    return diag(ErrorCode.AUTH_FAILED, { retryable: false, shouldRotateCredential: true, shouldFallback: true });
  }
  if (matchAny(errorMsg, MODEL_NOT_FOUND_PATTERNS)) {
    return diag(ErrorCode.MODEL_NOT_FOUND, { retryable: false, shouldFallback: true });
  }
  if (matchAny(errorMsg, TIMEOUT_MESSAGE_PATTERNS)) {
    return diag(ErrorCode.TIMEOUT);
  }
  return null;
}

// ── Extractors (Hermes _extract_status_code / _extract_error_body / _extract_error_code) ──

function extractStatusCode(error: unknown): number | undefined {
  let current: any = error;
  for (let i = 0; i < 5; i++) {
    if (typeof current?.status_code === 'number') return current.status_code;
    if (typeof current?.status === 'number' && current.status >= 100 && current.status < 600) return current.status;
    current = current?.cause || current?.__cause__ || current?.__context__;
    if (!current || current === error) break;
  }
  return undefined;
}

type ErrorLike = { body?: unknown; response?: { json?: () => unknown }; message?: string };
type ErrorPayload = { code?: unknown; type?: unknown; message?: unknown };

function extractErrorBody(error: unknown): Record<string, unknown> {
  const e = error as ErrorLike;
  if (e?.body && typeof e.body === 'object' && !Array.isArray(e.body)) return e.body as Record<string, unknown>;
  try { const r = e?.response?.json?.(); if (r && typeof r === 'object' && !Array.isArray(r)) return r as Record<string, unknown>; } catch { /* not JSON */ }
  return {};
}

function extractErrorCode(body: Record<string, unknown>): string {
  const err = body?.error;
  if (err && typeof err === 'object' && !Array.isArray(err)) {
    const payload = err as ErrorPayload;
    const code = payload.code || payload.type;
    if (typeof code === 'string' && code.trim() && code.trim() !== '400') return code.trim();
  }
  const code = body?.code || body?.error_code;
  if (typeof code === 'string' && code.trim() && code.trim() !== '400') return code.trim();
  return '';
}

function buildErrorMessage(error: unknown, body: Record<string, unknown>): string {
  const e = error as ErrorLike;
  const parts: string[] = [String(e?.message || error || '')];
  const errObj = body?.error;
  if (errObj && typeof errObj === 'object' && !Array.isArray(errObj)) {
    const payload = errObj as ErrorPayload;
    if (typeof payload.message === 'string') parts.push(payload.message);
  }
  return parts.filter(Boolean).join(' ').toLowerCase();
}

function matchAny(msg: string, patterns: readonly string[]): boolean {
  return patterns.some(p => msg.includes(p));
}

// ═══ Retry Strategy (Hermes jittered_backoff + retry_utils) ═══

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

/** Determine if an error is retryable */
export function isRetryable(code: ErrorCodeType): boolean {
  switch (code) {
    case ErrorCode.TIMEOUT:
    case ErrorCode.NETWORK:
    case ErrorCode.DNS:
    case ErrorCode.RATE_LIMITED:
    case ErrorCode.ENGINE_TIMEOUT:
    case ErrorCode.DB_ERROR:
    case ErrorCode.OVERLOADED:
    case ErrorCode.SERVER_ERROR:
    case ErrorCode.CONTEXT_OVERFLOW:
    case ErrorCode.PAYLOAD_TOO_LARGE:
    case ErrorCode.AUTH_FAILED:
      return true;
    case ErrorCode.AUTH_PERMANENT:
    case ErrorCode.BILLING_EXCEEDED:
    case ErrorCode.MODEL_NOT_FOUND:
    case ErrorCode.INVALID_INPUT:
    case ErrorCode.VALIDATION_FAILED:
    case ErrorCode.FORMAT_ERROR:
    case ErrorCode.CONTENT_POLICY_BLOCKED:
    case ErrorCode.PROVIDER_UNAVAILABLE:
    case ErrorCode.ENGINE_UNAVAILABLE:
    case ErrorCode.MODULE_FAILED:
    case ErrorCode.CORRUPTED_DATA:
    case ErrorCode.INTERNAL:
      return false;
  }
}

/**
 * Jittered exponential backoff (Hermes jittered_backoff).
 * Decorrelates concurrent retries to prevent thundering-herd.
 */
export function jitteredBackoff(
  attempt: number,
  baseDelayMs = 5000,
  maxDelayMs = 120_000,
  jitterRatio = 0.5,
): number {
  const exp = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
  const jitter = exp * jitterRatio * Math.random();
  return Math.min(exp + jitter, maxDelayMs);
}

/** Get recommended backoff based on error type */
export function getBackoffForError(code: ErrorCodeType, attempt: number): number {
  switch (code) {
    case ErrorCode.RATE_LIMITED:
      return jitteredBackoff(attempt, 5000, 120_000);
    case ErrorCode.OVERLOADED:
      return jitteredBackoff(attempt, 2000, 30_000);
    case ErrorCode.SERVER_ERROR:
      return jitteredBackoff(attempt, 1000, 15_000);
    default:
      return jitteredBackoff(attempt, 1000, 30_000);
  }
}

/** Execute a function with retry + jittered backoff */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
): Promise<T> {
  const cfg = { ...DEFAULT_RETRY, ...config };
  let lastError: unknown;

  for (let attempt = 1; attempt <= cfg.maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const diagErr = err instanceof DiagnosticAgentError ? err : null;
      const code = diagErr?.code || ErrorCode.INTERNAL;

      // CONTEXT_OVERFLOW: caller should compress and retry — don't loop here
      if (code === ErrorCode.CONTEXT_OVERFLOW) throw err;
      // AUTH_PERMANENT / BILLING / CONTENT_POLICY: abort immediately
      if (code === ErrorCode.AUTH_PERMANENT || code === ErrorCode.BILLING_EXCEEDED
        || code === ErrorCode.CONTENT_POLICY_BLOCKED) throw err;
      // FORMAT_ERROR: not retryable without changing request
      if (code === ErrorCode.FORMAT_ERROR) throw err;

      if (attempt > cfg.maxRetries) break;

      const retryable = diagErr?.retryable ?? false;
      if (!retryable) throw err;

      const delay = getBackoffForError(code, attempt);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  throw lastError;
}

// ═══ API Error Normalizer (unwrap SDK exceptions → DiagnosticAgentError) ═══

/**
 * Normalize any thrown error into a DiagnosticAgentError using the classification pipeline.
 * Call this at every API call boundary.
 */
export function normalizeError(
  error: unknown,
  opts: { provider?: string; model?: string; phase?: number; approxTokens?: number; contextLength?: number } = {},
): DiagnosticAgentError {
  if (error instanceof DiagnosticAgentError) return error;

  const err = error instanceof Error ? error : new Error(String(error));
  const classified = classifyApiError({
    error: err, provider: opts.provider, model: opts.model,
    approxTokens: opts.approxTokens, contextLength: opts.contextLength,
  });
  // Preserve the original phase if specified
  if (opts.phase != null) {
    return new DiagnosticAgentError({
      code: classified.code, message: classified.message, phase: opts.phase,
      retryable: classified.retryable, shouldCompress: classified.shouldCompress,
      shouldRotateCredential: classified.shouldRotateCredential,
      shouldFallback: classified.shouldFallback,
      cause: classified.cause, statusCode: classified.statusCode,
      provider: classified.provider, model: classified.model,
    });
  }
  return classified;
}
