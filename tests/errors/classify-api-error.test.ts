/**
 * tests/errors/classify-api-error.test.ts — classifyApiError 8 阶段分类流水线
 *
 * 铁律 0-2: 每个 public 函数 ≥ 2 用例 (happy + sad)
 */
import { describe, it, expect } from 'vitest';
import { classifyApiError, DiagnosticAgentError, ErrorCode } from '../../src/errors/types';

function makeError(statusCode: number, body: Record<string, unknown>): Error {
  const err = new Error(`HTTP ${statusCode}`);
  (err as any).status_code = statusCode;
  (err as any).body = body;
  return err;
}

describe('classifyApiError — HTTP status code classification', () => {
  // ── Happy: Correct classification ──

  it('Given 401, When classified, Then AUTH_FAILED + rotate + fallback', () => {
    const result = classifyApiError({ error: makeError(401, {}) });
    expect(result.code).toBe(ErrorCode.AUTH_FAILED);
    expect(result.shouldRotateCredential).toBe(true);
    expect(result.shouldFallback).toBe(true);
  });

  it('Given 429, When classified, Then RATE_LIMITED + rotate + fallback', () => {
    const result = classifyApiError({ error: makeError(429, {}) });
    expect(result.code).toBe(ErrorCode.RATE_LIMITED);
    expect(result.shouldRotateCredential).toBe(true);
  });

  it('Given 503, When classified, Then OVERLOADED + retryable', () => {
    const result = classifyApiError({ error: makeError(503, {}) });
    expect(result.code).toBe(ErrorCode.OVERLOADED);
    expect(result.retryable).toBe(true);
  });

  it('Given 500, When classified, Then SERVER_ERROR + retryable', () => {
    const result = classifyApiError({ error: makeError(500, {}) });
    expect(result.code).toBe(ErrorCode.SERVER_ERROR);
    expect(result.retryable).toBe(true);
  });

  it('Given 413, When classified, Then PAYLOAD_TOO_LARGE + shouldCompress', () => {
    const result = classifyApiError({ error: makeError(413, {}) });
    expect(result.code).toBe(ErrorCode.PAYLOAD_TOO_LARGE);
    expect(result.shouldCompress).toBe(true);
  });

  // ── Sad: Invalid inputs ──

  it('Given generic Error without status, When classified, Then INTERNAL (unknown)', () => {
    const result = classifyApiError({ error: new Error('something went wrong') });
    expect(result.code).toBe(ErrorCode.INTERNAL);
    expect(result.retryable).toBe(true); // unknown defaults to retryable
  });

  it('Given 404 with model_not_found message, When classified, Then MODEL_NOT_FOUND', () => {
    const err = makeError(404, { error: { message: 'model not found: deepseek-v3' } });
    const result = classifyApiError({ error: err });
    expect(result.code).toBe(ErrorCode.MODEL_NOT_FOUND);
    expect(result.shouldFallback).toBe(true);
  });
});

describe('classifyApiError — Message-aware disambiguation', () => {
  it('Given 402 with "try again" signal, When classified, Then RATE_LIMITED (not billing)', () => {
    const err = makeError(402, { error: { message: 'Usage limit exceeded. Try again in 5 minutes.' } });
    const result = classifyApiError({ error: err });
    expect(result.code).toBe(ErrorCode.RATE_LIMITED);
  });

  it('Given 402 without transient signal, When classified, Then BILLING_EXCEEDED', () => {
    const err = makeError(402, { error: { message: 'Insufficient credits. Top up your account.' } });
    const result = classifyApiError({ error: err });
    expect(result.code).toBe(ErrorCode.BILLING_EXCEEDED);
  });

  it('Given 400 with context overflow message, When classified, Then CONTEXT_OVERFLOW + compress', () => {
    const err = makeError(400, { error: { message: 'context length exceeded maximum of 128000 tokens' } });
    const result = classifyApiError({ error: err });
    expect(result.code).toBe(ErrorCode.CONTEXT_OVERFLOW);
    expect(result.shouldCompress).toBe(true);
  });

  it('Given 400 generic, When classified, Then FORMAT_ERROR + non-retryable', () => {
    const err = makeError(400, { error: { message: 'Bad Request' } });
    const result = classifyApiError({ error: err, approxTokens: 1000 });
    expect(result.code).toBe(ErrorCode.FORMAT_ERROR);
    expect(result.retryable).toBe(false);
  });
});

describe('classifyApiError — Content policy & auth patterns', () => {
  it('Given content_policy_blocked message, When classified, Then CONTENT_POLICY_BLOCKED', () => {
    const err = new Error('Your request was flagged by our safety system');
    const result = classifyApiError({ error: err });
    expect(result.code).toBe(ErrorCode.CONTENT_POLICY_BLOCKED);
    expect(result.retryable).toBe(false);
  });

  it('Given auth pattern without status code, When classified, Then AUTH_FAILED + rotate', () => {
    const err = new Error('invalid api key');
    const result = classifyApiError({ error: err });
    expect(result.code).toBe(ErrorCode.AUTH_FAILED);
    expect(result.shouldRotateCredential).toBe(true);
  });
});

describe('classifyApiError — Transport heuristics', () => {
  it('Given TimeoutError, When classified, Then TIMEOUT', () => {
    const err = new Error('request timed out');
    const result = classifyApiError({ error: err });
    expect(result.code).toBe(ErrorCode.TIMEOUT);
    expect(result.retryable).toBe(true);
  });

  it('Given SSL error, When classified, Then TIMEOUT', () => {
    const err = new Error('ssl alert: bad record mac');
    const result = classifyApiError({ error: err });
    expect(result.code).toBe(ErrorCode.TIMEOUT);
  });
});

describe('DiagnosticAgentError — constructor compat', () => {
  it('Given options object, When constructed, Then all fields set', () => {
    const err = new DiagnosticAgentError({
      code: ErrorCode.TIMEOUT, message: 'timeout', phase: 1,
      retryable: true, shouldCompress: false,
      statusCode: 504, provider: 'deepseek', model: 'v4-flash',
    });
    expect(err.code).toBe(ErrorCode.TIMEOUT);
    expect(err.phase).toBe(1);
    expect(err.retryable).toBe(true);
    expect(err.statusCode).toBe(504);
    expect(err.provider).toBe('deepseek');
  });

  it('Given old positional args, When constructed, Then backward compat works', () => {
    const err = new DiagnosticAgentError(ErrorCode.NETWORK, 'net error', 0, true);
    expect(err.code).toBe(ErrorCode.NETWORK);
    expect(err.retryable).toBe(true);
    expect(err.shouldCompress).toBe(false);
  });
});
