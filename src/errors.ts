/**
 * errors.ts — re-export from @synova/error-types
 *
 * @synova/error-types@1.0.0 — DiagnosticAgentError + 9 subclasses + llmErrorFromHttpStatus
 */
export {
  DiagnosticAgentError,
  LLMTimeoutError,
  LLMAuthError,
  LLMNetworkError,
  LLMRateLimitError,
  LLMInvalidResponseError,
  ToolExecError,
  ToolNotFoundError,
  StorageError,
  ValidationError,
  llmErrorFromHttpStatus,
} from '@synova/error-types';
