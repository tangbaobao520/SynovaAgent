/**
 * error-types.test.ts — 类型化错误测试 (Slice 2.1, iron law 0-2 Step 2)
 *
 * 验证: DiagnosticAgentError 基类 + 子类的 code/phase/retryable
 *       以及 llmErrorFromHttpStatus 工厂函数。
 */
import { describe, it, expect } from 'vitest';
import {
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
} from '../src/errors';

describe('Error type hierarchy', () => {
  it('Given LLMTimeoutError, Then instanceof DiagnosticAgentError is true', () => {
    const e = new LLMTimeoutError();
    expect(e instanceof DiagnosticAgentError).toBe(true);
    expect(e instanceof Error).toBe(true);
    expect(e.name).toBe('LLMTimeoutError');
  });

  it('Given LLMTimeoutError, Then retryable=true, code=LLM_TIMEOUT', () => {
    const e = new LLMTimeoutError();
    expect(e.retryable).toBe(true);
    expect(e.code).toBe('LLM_TIMEOUT');
    expect(e.phase).toBe(0);
  });

  it('Given LLMAuthError, Then retryable=false', () => {
    const e = new LLMAuthError();
    expect(e.retryable).toBe(false);
    expect(e.code).toBe('LLM_AUTH');
  });

  it('Given ToolExecError, Then retryable=false, contains toolName', () => {
    const e = new ToolExecError('query_ontology', '本体 API 不可达');
    expect(e.retryable).toBe(false);
    expect(e.code).toBe('TOOL_EXEC');
    expect(e.toolName).toBe('query_ontology');
    expect(e.message).toContain('query_ontology');
  });

  it('Given ToolNotFoundError, Then retryable=false', () => {
    const e = new ToolNotFoundError('unknown_tool');
    expect(e.retryable).toBe(false);
    expect(e.code).toBe('TOOL_NOT_FOUND');
  });

  it('Given StorageError, Then defaults to retryable=false', () => {
    const e = new StorageError('write', 'disk full');
    expect(e.retryable).toBe(false);
    // but can be marked retryable
    const e2 = new StorageError('read', 'lock timeout', true);
    expect(e2.retryable).toBe(true);
  });

  it('Given ValidationError, Then retryable=false', () => {
    const e = new ValidationError('orgId', '格式无效');
    expect(e.retryable).toBe(false);
    expect(e.code).toBe('VALIDATION');
  });
});

describe('llmErrorFromHttpStatus', () => {
  it('Given HTTP 401, Then returns LLMAuthError', () => {
    const e = llmErrorFromHttpStatus(401, 'Unauthorized');
    expect(e).toBeInstanceOf(LLMAuthError);
    expect(e.retryable).toBe(false);
  });

  it('Given HTTP 403, Then returns LLMAuthError', () => {
    const e = llmErrorFromHttpStatus(403);
    expect(e).toBeInstanceOf(LLMAuthError);
  });

  it('Given HTTP 429, Then returns LLMRateLimitError (retryable)', () => {
    const e = llmErrorFromHttpStatus(429);
    expect(e).toBeInstanceOf(LLMRateLimitError);
    expect(e.retryable).toBe(true);
  });

  it('Given HTTP 500, Then returns LLMNetworkError (retryable)', () => {
    const e = llmErrorFromHttpStatus(500);
    expect(e).toBeInstanceOf(LLMNetworkError);
    expect(e.retryable).toBe(true);
  });

  it('Given HTTP 200, Then returns LLMInvalidResponseError', () => {
    const e = llmErrorFromHttpStatus(200, 'Missing content');
    expect(e).toBeInstanceOf(LLMInvalidResponseError);
    expect(e.code).toBe('LLM_INVALID_RESPONSE');
  });
});

describe('Error serialization', () => {
  it('Given any DiagnosticAgentError, When inspected directly, Then code+phase+retryable are correct', () => {
    const e = new LLMTimeoutError('请求超时 120s', 2);
    expect(e.code).toBe('LLM_TIMEOUT');
    expect(e.phase).toBe(2);
    expect(e.retryable).toBe(true);
    expect(e.message).toContain('120s');
  });

  it('Given DiagnosticAgentError, When JSON.stringify, Then name and code are preserved', () => {
    const e = new LLMTimeoutError('请求超时');
    const json = JSON.parse(JSON.stringify(e));
    expect(json.code).toBe('LLM_TIMEOUT');
    expect(json.name).toBe('LLMTimeoutError');
    expect(json.retryable).toBe(true);
  });
});
