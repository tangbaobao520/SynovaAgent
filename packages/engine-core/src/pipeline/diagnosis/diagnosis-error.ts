/**
 * diagnosis-error.ts — SynovaAgent Diagnostic Error Type Hierarchy
 *
 * Three-layered design:
 *   1. CLASS HIERARCHY — DiagnosticAgentError base + 6 subclasses.
 *      Each carries enough structured metadata for upstream callers to make
 *      differentiated decisions (retry / degrade / fail-fast) without
 *      string-parsing error messages.
 *   2. TYPE GUARDS — isRetryable, isDegraded, getFailurePhase.
 *      Work on `unknown` so they are safe in catch blocks.
 *   3. ERROR NORMALIZER — normalizeDiagnosisError (legacy, kept for
 *      backwards-compatible string→structured fallback).
 *
 * Patterns referenced:
 *   - Claw-Code ApiError enum: rich metadata variants, factory constructors,
 *     is_retryable() / safe_failure_class() methods on the enum itself.
 *   - OpenClaw Error subclasses: this.name = 'ClassName', .code property,
 *     extend native Error.
 *
 * @module diagnosis-error
 */

import { DiagnosisErrorCode } from './types';

// ============================================================================
// 1. BASE CLASS — DiagnosticAgentError
// ============================================================================

/**
 * Base error class for all SynovaAgent diagnosis pipeline failures.
 *
 * Every subclass carries:
 * - `code`    — machine-readable {@link DiagnosisErrorCode} for error-type routing.
 * - `phase`   — which pipeline phase (0-5) the error originated in, or -1 if unknown.
 * - `retryable` — whether this category of error can be retried with a reasonable
 *                  expectation of success.
 * - `cause`   — the underlying Error that triggered this failure, if any.
 *
 * Upstream callers switch on `code` to decide: retry with backoff, mark module
 * degraded and continue, or fail the entire consultation.
 */
export class DiagnosticAgentError extends Error {
  /** Machine-readable error code for routing decisions. */
  public readonly code: DiagnosisErrorCode;

  /**
   * Pipeline phase where the error occurred.
   * 0 = scoping, 1 = evidence collection, 2 = hypothesis generation,
   * 3 = root cause analysis, 4 = report rendering, 5 = delivery.
   * -1 means the phase is unknown or not applicable.
   */
  public readonly phase: number;

  /** Whether retrying the operation is expected to succeed. */
  public readonly retryable: boolean;

  /** The underlying cause, preserved for diagnostic traceability. */
  public readonly cause?: Error;

  constructor(
    code: DiagnosisErrorCode,
    message: string,
    phase: number,
    retryable: boolean,
    cause?: Error,
  ) {
    super(message);
    this.name = 'DiagnosticAgentError';
    this.code = code;
    this.phase = phase;
    this.retryable = retryable;
    this.cause = cause;

    // Restore prototype chain lost when extending Error in TS.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ============================================================================
// 2. SUBCLASSES — One per failure domain
// ============================================================================

// ── 2a. PhaseExecError ─────────────────────────────────────────────────────

/**
 * A complete phase execution failure.
 *
 * Unlike {@link ModuleExecError} (single module degraded), this signals that
 * an entire phase could not produce usable output. The orchestrator should
 * either recover (retry the phase) or abort the consultation.
 */
export class PhaseExecError extends DiagnosticAgentError {
  /** Which module within the phase triggered the failure. */
  public readonly moduleName: string;

  /** Human-readable description of what the phase was trying to do. */
  public readonly phaseDescription: string;

  constructor(
    phase: number,
    moduleName: string,
    phaseDescription: string,
    cause?: Error,
  ) {
    super(
      DiagnosisErrorCode.MODULE_FAILED,
      `Phase ${phase} execution failed in module "${moduleName}": ${phaseDescription}`,
      phase,
      /* retryable */ true, // phase-level failures are retryable (recovery executor handles the retry)
      cause,
    );
    this.name = 'PhaseExecError';
    this.moduleName = moduleName;
    this.phaseDescription = phaseDescription;
  }
}

// ── 2b. LLMCallError ───────────────────────────────────────────────────────

/** Suggested recovery action the caller should take after an LLM call failure. */
export type LLMSuggestedAction =
  | 'retry'
  | 'retry_with_backoff'
  | 'switch_model'
  | 'reduce_prompt'
  | 'compact_session'
  | 'check_credentials'
  | 'contact_provider';

/**
 * An LLM API call failure with full provider/model/status metadata.
 *
 * Carries enough context for the caller to decide:
 * - Is it retryable (5xx, 429)?
 * - Should we switch to a fallback model?
 * - Should we compact the session (context window exceeded)?
 * - Should we alert the user about credentials?
 *
 * The `suggestedAction` field gives upstream a pre-computed recommendation
 * derived from the HTTP status + error body markers.
 */
export class LLMCallError extends DiagnosticAgentError {
  /** LLM provider name (e.g. "anthropic", "openai", "deepseek"). */
  public readonly provider: string;

  /** Model identifier that was requested (e.g. "claude-opus-4-6"). */
  public readonly model: string;

  /** HTTP status code, or 0 if the request never reached the server. */
  public readonly httpStatus: number;

  /** First 500 characters of the response body for diagnostics. */
  public readonly bodySnippet: string;

  /** Pre-computed recovery suggestion based on status code + error markers. */
  public readonly suggestedAction: LLMSuggestedAction;

  /** Provider-supplied request ID, if available in the response headers/body. */
  public readonly requestId?: string;

  constructor(
    provider: string,
    model: string,
    httpStatus: number,
    retryable: boolean,
    suggestedAction: LLMSuggestedAction,
    body?: string,
    requestId?: string,
    cause?: Error,
  ) {
    const snippet = truncateBodySnippet(body ?? '', 500);
    const message = `LLM call failed: ${provider}/${model} returned HTTP ${httpStatus}`
      + (requestId ? ` [trace ${requestId}]` : '')
      + (snippet ? ` — ${snippet}` : '');

    super(
      httpStatus === 429 || (httpStatus >= 500 && httpStatus < 600)
        ? DiagnosisErrorCode.LLM_TIMEOUT  // 429 / 5xx → recoverable timeout class
        : httpStatus === 401 || httpStatus === 403
          ? DiagnosisErrorCode.PERMISSION_DENIED
          : DiagnosisErrorCode.MODULE_FAILED,
      message,
      /* phase */ -1, // LLM calls happen across phases; caller sets phase if known
      retryable,
      cause,
    );
    this.name = 'LLMCallError';
    this.provider = provider;
    this.model = model;
    this.httpStatus = httpStatus;
    this.bodySnippet = snippet;
    this.suggestedAction = suggestedAction;
    this.requestId = requestId;
  }
}

// ── 2c. ModuleExecError ────────────────────────────────────────────────────

/**
 * An individual diagnosis module failed, but the pipeline can continue
 * in degraded mode (skip the module, use defaults, or fall back to rules).
 *
 * The `degraded` flag is the key differentiator: when true, the module is
 * marked in `degradedModules[]` and downstream steps receive a partial result.
 * When false, the module failure is hard and should propagate up.
 */
export class ModuleExecError extends DiagnosticAgentError {
  /** The module that failed (matches {@link ModuleRegistry} module names). */
  public readonly moduleName: string;

  /** Whether this failure allows degraded continuation. */
  public readonly degraded: boolean;

  constructor(
    moduleName: string,
    message: string,
    degraded: boolean,
    cause?: Error,
  ) {
    super(
      DiagnosisErrorCode.MODULE_FAILED,
      `Module "${moduleName}" failed: ${message}`,
      /* phase */ -1, // caller sets if known
      degraded, // retryable if degraded (recovery may re-run), non-retryable if hard failure
      cause,
    );
    this.name = 'ModuleExecError';
    this.moduleName = moduleName;
    this.degraded = degraded;
  }
}

// ── 2d. SessionCompactionError ─────────────────────────────────────────────

/**
 * Session compaction failed — the conversation history could not be
 * compressed into the available context window.
 *
 * This is a pre-condition failure for any LLM-dependent phase. The
 * recommended response is to reduce evidence size or split the consultation
 * into smaller sub-diagnoses.
 */
export class SessionCompactionError extends DiagnosticAgentError {
  /** Estimated total tokens before compaction was attempted. */
  public readonly estimatedTokens: number;

  /** The context window limit (in tokens) of the target model. */
  public readonly contextWindowTokens: number;

  constructor(
    estimatedTokens: number,
    contextWindowTokens: number,
    cause?: Error,
  ) {
    super(
      DiagnosisErrorCode.LLM_TIMEOUT, // context window failures reuse LLM_TIMEOUT
      `Session compaction failed: estimated ${estimatedTokens} tokens exceed ${contextWindowTokens}-token window`,
      /* phase */ -1,
      /* retryable */ false, // compaction failure is not retryable without reducing input size
      cause,
    );
    this.name = 'SessionCompactionError';
    this.estimatedTokens = estimatedTokens;
    this.contextWindowTokens = contextWindowTokens;
  }
}

// ── 2e. EvidencePoolError ──────────────────────────────────────────────────

/**
 * The evidence pool encountered an overflow or corruption condition.
 *
 * Evidence overflow: too many evidence items accumulated (typically from
 * long-running conversations with many data sources). The pipeline should
 * trim or prioritize evidence before retrying.
 *
 * Evidence corruption: the serialized evidence data is invalid (e.g., JSON
 * parse failure, checksum mismatch). The pipeline should discard corrupted
 * entries and retry with remaining valid evidence.
 */
export class EvidencePoolError extends DiagnosticAgentError {
  /** Distinguishes overflow from corruption. */
  public readonly type: 'overflow' | 'corruption';

  /** Number of evidence items when the error occurred. */
  public readonly itemCount: number;

  /** Maximum evidence capacity, if the error is an overflow. */
  public readonly maxCapacity?: number;

  /** Index or key of the corrupted evidence item, if the error is corruption. */
  public readonly corruptedKey?: string;

  constructor(
    type: 'overflow' | 'corruption',
    itemCount: number,
    message: string,
    maxCapacity?: number,
    corruptedKey?: string,
    cause?: Error,
  ) {
    // Overflow is recoverable (trim evidence); corruption is not (data is lost).
    const recoverable = type === 'overflow';

    super(
      type === 'corruption'
        ? DiagnosisErrorCode.SESSION_CORRUPTED
        : DiagnosisErrorCode.EVIDENCE_INSUFFICIENT,
      message,
      /* phase */ 1, // evidence pool is used primarily in Phase 1 collection
      recoverable,
      cause,
    );
    this.name = 'EvidencePoolError';
    this.type = type;
    this.itemCount = itemCount;
    this.maxCapacity = maxCapacity;
    this.corruptedKey = corruptedKey;
  }
}

// ── 2f. RecoveryExhaustedError ─────────────────────────────────────────────

/**
 * All recovery attempts for a given failure scenario have been exhausted.
 *
 * This is the terminal error — the pipeline has tried every registered
 * recovery recipe and none succeeded. Upstream should either abort the
 * consultation or mark all dependent modules as degraded.
 */
export class RecoveryExhaustedError extends DiagnosticAgentError {
  /** The failure scenario that could not be recovered from. */
  public readonly scenario: string;

  /** Total recovery attempts across all recipes. */
  public readonly attempts: number;

  /** The final error that caused the last recovery attempt to fail. */
  public readonly lastError: Error;

  constructor(
    scenario: string,
    attempts: number,
    lastError: Error,
  ) {
    super(
      DiagnosisErrorCode.RECOVERY_EXHAUSTED,
      `Recovery exhausted for "${scenario}" after ${attempts} attempt${attempts > 1 ? 's' : ''}: ${lastError.message}`,
      /* phase */ -1,
      /* retryable */ false, // recovery exhausted = no more retries
      lastError,
    );
    this.name = 'RecoveryExhaustedError';
    this.scenario = scenario;
    this.attempts = attempts;
    this.lastError = lastError;
  }
}

// ============================================================================
// 3. TYPE GUARD FUNCTIONS
// ============================================================================

/**
 * Check whether an error indicates a retryable condition.
 *
 * Works on `unknown` so it is safe to use in catch blocks without
 * type narrowing. Returns false for non-Error inputs.
 *
 * @example
 * ```typescript
 * try { await llmCall(); }
 * catch (err) {
 *   if (isRetryable(err)) {
 *     return await retryWithBackoff(() => llmCall());
 *   }
 *   throw err;
 * }
 * ```
 */
export function isRetryable(err: unknown): boolean {
  if (err instanceof DiagnosticAgentError) {
    // Recurse into RecoveryExhausted: if the *last* error was retryable,
    // then exhaustion was because of bad luck, not a permanent error.
    if (err instanceof RecoveryExhaustedError) {
      return isRetryable(err.lastError);
    }
    return err.retryable;
  }

  // Fallback: normalize the error and check the RECOVERABLE_CODES set.
  if (err instanceof Error) {
    const normalized = normalizeDiagnosisError(err);
    return normalized.recoverable;
  }

  return false;
}

/**
 * Check whether an error represents a degraded (non-fatal) module failure.
 *
 * A degraded failure means the pipeline can continue with partial results
 * and the affected module is listed in `degradedModules[]`.
 *
 * @example
 * ```typescript
 * try { result = await runModule('honA'); }
 * catch (err) {
 *   if (isDegraded(err)) {
 *     result = getDefaultModuleResult('honA');
 *     degradedModules.push('honA');
 *   } else {
 *     throw err; // hard failure — propagate
 *   }
 * }
 * ```
 */
export function isDegraded(err: unknown): boolean {
  if (err instanceof ModuleExecError) {
    return err.degraded;
  }
  // PhaseExecError and RecoveryExhaustedError with degraded sub-errors
  // are not themselves degraded signals.
  return false;
}

/**
 * Extract the pipeline phase number from an error, or null if unknown.
 *
 * Useful for error telemetry and recovery routing: knowing which phase
 * failed helps select the appropriate recovery recipe.
 *
 * @returns The phase number (0-5), or null if the phase is unknown or
 *          the error is not a DiagnosticAgentError.
 */
export function getFailurePhase(err: unknown): number | null {
  if (err instanceof DiagnosticAgentError) {
    return err.phase >= 0 ? err.phase : null;
  }
  return null;
}

// ============================================================================
// 4. ERROR FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a {@link PhaseExecError} when an entire phase fails.
 *
 * @param phase    — Pipeline phase number (0-5).
 * @param module   — Module within the phase that triggered the failure.
 * @param description — Human-readable description of what the phase was doing.
 * @param cause    — The underlying error, if any.
 */
export function phaseExecFailed(
  phase: number,
  module: string,
  description: string,
  cause?: Error,
): PhaseExecError {
  return new PhaseExecError(phase, module, description, cause);
}

/**
 * Create an {@link LLMCallError} with automatic status-based classification.
 *
 * The `suggestedAction` is derived from the HTTP status and body content:
 *
 * | Status | Markers in body         | suggestedAction      |
 * |--------|-------------------------|----------------------|
 * | 429    | —                       | retry_with_backoff   |
 * | 5xx    | —                       | retry                |
 * | 400    | "context window"        | compact_session      |
 * | 400    | "too many tokens"       | compact_session      |
 * | 401/403| —                       | check_credentials    |
 * | 413    | —                       | reduce_prompt        |
 * | other  | —                       | contact_provider     |
 *
 * @param provider  — LLM provider name (e.g. "anthropic", "deepseek").
 * @param model     — Model identifier.
 * @param status    — HTTP status code.
 * @param body      — Optional response body for diagnostics.
 * @param requestId — Optional provider-supplied request ID.
 * @param cause     — The underlying network/HTTP error, if any.
 */
export function llmCallFailed(
  provider: string,
  model: string,
  status: number,
  body?: string,
  requestId?: string,
  cause?: Error,
): LLMCallError {
  const { retryable, suggestedAction } = classifyLLMStatus(status, body ?? '');

  return new LLMCallError(
    provider,
    model,
    status,
    retryable,
    suggestedAction,
    body,
    requestId,
    cause,
  );
}

/**
 * Create a {@link ModuleExecError} for a degraded module failure.
 *
 * The caller should add `moduleName` to the consultation's `degradedModules[]`
 * and continue with a default or rule-based result.
 */
export function moduleFailedDegraded(
  moduleName: string,
  message: string,
  cause?: Error,
): ModuleExecError {
  return new ModuleExecError(moduleName, message, /* degraded */ true, cause);
}

/**
 * Create a {@link ModuleExecError} for a hard (non-degraded) module failure.
 *
 * This failure should propagate up — the pipeline cannot continue without
 * this module's output.
 */
export function moduleFailedHard(
  moduleName: string,
  message: string,
  cause?: Error,
): ModuleExecError {
  return new ModuleExecError(moduleName, message, /* degraded */ false, cause);
}

/**
 * Create a {@link SessionCompactionError} when the session cannot be
 * compressed to fit the model's context window.
 */
export function sessionCompactionFailed(
  estimatedTokens: number,
  contextWindowTokens: number,
  cause?: Error,
): SessionCompactionError {
  return new SessionCompactionError(estimatedTokens, contextWindowTokens, cause);
}

/**
 * Create an {@link EvidencePoolError} for evidence overflow.
 */
export function evidencePoolOverflow(
  itemCount: number,
  maxCapacity: number,
): EvidencePoolError {
  return new EvidencePoolError(
    'overflow',
    itemCount,
    `Evidence pool overflow: ${itemCount} items exceed capacity of ${maxCapacity}`,
    maxCapacity,
    undefined,
  );
}

/**
 * Create an {@link EvidencePoolError} for evidence corruption.
 */
export function evidencePoolCorrupted(
  itemCount: number,
  corruptedKey: string,
  cause?: Error,
): EvidencePoolError {
  return new EvidencePoolError(
    'corruption',
    itemCount,
    `Evidence pool corruption: item "${corruptedKey}" is invalid or unreadable`,
    undefined,
    corruptedKey,
    cause,
  );
}

/**
 * Create a {@link RecoveryExhaustedError} when all recovery attempts fail.
 */
export function recoveryExhausted(
  scenario: string,
  attempts: number,
  lastError: Error,
): RecoveryExhaustedError {
  return new RecoveryExhaustedError(scenario, attempts, lastError);
}

// ============================================================================
// 5. LEGACY — normalizeDiagnosisError (backwards-compatible)
// ============================================================================

/** Structured error output from the legacy normalizer. Kept for compatibility. */
export interface NormalizedDiagnosisError {
  code: DiagnosisErrorCode;
  message: string;
  recoverable: boolean;
}

/** Error codes that are considered retryable/recoverable. */
const RECOVERABLE_CODES = new Set<DiagnosisErrorCode>([
  DiagnosisErrorCode.LLM_TIMEOUT,
  DiagnosisErrorCode.TOOL_TIMEOUT,
  DiagnosisErrorCode.MODULE_FAILED,
  DiagnosisErrorCode.EVIDENCE_INSUFFICIENT,
  DiagnosisErrorCode.GATE_CHECK_FAILED,
]);

/** Error codes that are never retryable. */
const NON_RECOVERABLE_CODES = new Set<DiagnosisErrorCode>([
  DiagnosisErrorCode.SESSION_CORRUPTED,
  DiagnosisErrorCode.PERMISSION_DENIED,
  DiagnosisErrorCode.RECOVERY_EXHAUSTED,
  DiagnosisErrorCode.SUBAGENT_LOST,
]);

/**
 * Keyword-to-error-code pattern map for string-based error classification.
 *
 * Order matters: earlier patterns take priority. Patterns are tested in
 * the order listed.
 */
const PATTERN_MAP: Array<{ pattern: RegExp; code: DiagnosisErrorCode }> = [
  { pattern: /time\s*out|timed?\s*out|ETIMEDOUT|ECONNABORTED|abort/i, code: DiagnosisErrorCode.LLM_TIMEOUT },
  { pattern: /rate.?limit|429|too many requests/i, code: DiagnosisErrorCode.LLM_TIMEOUT },
  { pattern: /permission.?denied|unauthorized|forbidden|401|403/i, code: DiagnosisErrorCode.PERMISSION_DENIED },
  { pattern: /module.?fail|computation.?fail/i, code: DiagnosisErrorCode.MODULE_FAILED },
  { pattern: /tool.?timeout|tool.?fail/i, code: DiagnosisErrorCode.TOOL_TIMEOUT },
  { pattern: /session.?corrupt|deserializ|JSON\.parse|invalid state/i, code: DiagnosisErrorCode.SESSION_CORRUPTED },
  { pattern: /recovery.?exhausted|max.?retry|max.?attempt/i, code: DiagnosisErrorCode.RECOVERY_EXHAUSTED },
  { pattern: /evidence.?insufficient|not enough data|empty result/i, code: DiagnosisErrorCode.EVIDENCE_INSUFFICIENT },
  { pattern: /gate.?check.?fail|data.?completeness/i, code: DiagnosisErrorCode.GATE_CHECK_FAILED },
  { pattern: /sub.?agent.?lost|orphaned|subagent/i, code: DiagnosisErrorCode.SUBAGENT_LOST },
  { pattern: /context.?window|token.?limit|maximum context/i, code: DiagnosisErrorCode.LLM_TIMEOUT },
  { pattern: /network|ECONNREFUSED|ENOTFOUND|fetch failed/i, code: DiagnosisErrorCode.LLM_TIMEOUT },
];

/**
 * Normalize any thrown value into a structured diagnosis error.
 *
 * Priority:
 *   1. If the error is already a {@link DiagnosticAgentError}, use its
 *      `code` and `retryable` directly.
 *   2. If the error message is an exact (case-insensitive) match for a
 *      {@link DiagnosisErrorCode} enum value, use that.
 *   3. Match error message against keyword patterns.
 *   4. Fall back to `MODULE_FAILED` + `recoverable: false`.
 *
 * @param err — Any thrown value (Error, string, number, null, etc.)
 * @returns Structured error object suitable for recovery routing.
 */
export function normalizeDiagnosisError(err: unknown): NormalizedDiagnosisError {
  // ═══ Priority 1: DiagnosticAgentError instance — use its own metadata ═══
  if (err instanceof DiagnosticAgentError) {
    return {
      code: err.code,
      message: err.message,
      recoverable: err.retryable,
    };
  }

  const message = extractMessage(err);

  // ═══ Priority 2: Exact enum value match ═══
  const codeFromEnum = tryMatchEnum(message);
  if (codeFromEnum) {
    return {
      code: codeFromEnum,
      message,
      recoverable: RECOVERABLE_CODES.has(codeFromEnum),
    };
  }

  // ═══ Priority 3: Keyword pattern match ═══
  for (const { pattern, code } of PATTERN_MAP) {
    if (pattern.test(message)) {
      return { code, message, recoverable: RECOVERABLE_CODES.has(code) };
    }
  }

  // ═══ Priority 4: Unknown — default to MODULE_FAILED, non-recoverable ═══
  return {
    code: DiagnosisErrorCode.MODULE_FAILED,
    message,
    recoverable: false,
  };
}

// ============================================================================
// 6. INTERNAL HELPERS
// ============================================================================

/**
 * Extract a human-readable message string from any thrown value.
 */
function extractMessage(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  if (
    err &&
    typeof err === 'object' &&
    'message' in err &&
    typeof (err as Record<string, unknown>).message === 'string'
  ) {
    return (err as Record<string, string>).message;
  }
  return String(err);
}

/**
 * Try to match a message string against the {@link DiagnosisErrorCode} enum values.
 * Checks exact match, case-insensitive match, and substring containment (in that order).
 */
function tryMatchEnum(message: string): DiagnosisErrorCode | null {
  const values = Object.values(DiagnosisErrorCode);

  // Exact match
  if (values.includes(message as DiagnosisErrorCode)) {
    return message as DiagnosisErrorCode;
  }

  // Case-insensitive match
  const upper = message.toUpperCase();
  for (const v of values) {
    if (upper === v) return v;
  }

  // Substring containment (message contains the enum value)
  for (const v of values) {
    if (upper.includes(v)) return v;
  }

  return null;
}

/**
 * Truncate a response body to `maxChars` characters, preserving the leading
 * portion which typically contains the most relevant error information.
 * Appends an ellipsis (…) when truncation occurs.
 */
function truncateBodySnippet(body: string, maxChars: number): string {
  if (body.length <= maxChars) return body;
  return body.slice(0, maxChars) + '…';
}

/**
 * Classify an HTTP status code and response body into a retryability
 * decision and suggested user action.
 *
 * Mirrors Claw-Code's `is_retryable()` + `safe_failure_class()` logic.
 */
function classifyLLMStatus(
  status: number,
  body: string,
): { retryable: boolean; suggestedAction: LLMSuggestedAction } {
  const lowerBody = body.toLowerCase();

  // 429 — rate limit, always retryable with backoff.
  if (status === 429) {
    return { retryable: true, suggestedAction: 'retry_with_backoff' };
  }

  // 5xx — server errors, retryable.
  if (status >= 500 && status < 600) {
    return { retryable: true, suggestedAction: 'retry' };
  }

  // 400 / 413 / 422 — check for context window exceeded.
  if (status === 400 || status === 413 || status === 422) {
    if (
      lowerBody.includes('context window') ||
      lowerBody.includes('context length') ||
      lowerBody.includes('too many tokens') ||
      lowerBody.includes('prompt is too long') ||
      lowerBody.includes('input is too long') ||
      lowerBody.includes('maximum context') ||
      lowerBody.includes('configured limit')
    ) {
      return { retryable: false, suggestedAction: 'compact_session' };
    }
  }

  // 413 — request body too large.
  if (status === 413) {
    return { retryable: false, suggestedAction: 'reduce_prompt' };
  }

  // 401 / 403 — authentication/permission.
  if (status === 401 || status === 403) {
    return { retryable: false, suggestedAction: 'check_credentials' };
  }

  // 408 — request timeout, retryable.
  if (status === 408) {
    return { retryable: true, suggestedAction: 'retry' };
  }

  // Default for unknown status codes.
  return { retryable: status >= 500, suggestedAction: 'contact_provider' };
}

// ============================================================================
// EXPORTS
// ============================================================================

export { RECOVERABLE_CODES, NON_RECOVERABLE_CODES };
