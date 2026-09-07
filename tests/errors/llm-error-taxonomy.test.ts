/**
 * tests/errors/llm-error-taxonomy.test.ts — DSH 借鉴卡 B-01（dev doc §5 测试契约）
 *
 * 3 个范式:
 *   1. normalizeLlmFailure — 归一化边界: 任意 throw → 冻结 {message, code}，敌意值不逃逸
 *   2. isContextWindowExceededError / isQuotaExceededError — provider code+type+message
 *      合一 detail 正则分类（thrown 与 in-band 共享一个分类器）
 *   3. canonical 码对齐 — EMPTY_RESPONSE（assembler 侧）/ INVALID_CREDENTIAL（api-key 侧）
 *
 * 铁律 48: 非空壳 — 正常/降级/边界三路径，每用例 ≥3 断言。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  DiagnosticAgentError, ErrorCode, normalizeLlmFailure,
  isContextWindowExceededError, isQuotaExceededError,
} from '../../src/errors/types';
import { createOpenAICompatibleProvider } from '../../src/providers/base';
import type { LLMMessage } from '../../src/providers/types';

const MSG: LLMMessage[] = [{ role: 'user', content: '诊断这家企业的增长瓶颈' }];

// ═══ 1. normalizeLlmFailure — 归一化边界 ═══

describe('normalizeLlmFailure — 正常路径', () => {
  it('Given Error, When normalized, Then frozen {message, code=UNKNOWN} + 无 status 散落字段', () => {
    const f = normalizeLlmFailure(new Error('boom'));
    expect(Object.isFrozen(f)).toBe(true);
    expect(f.message).toBe('boom');
    expect(f.code).toBe('UNKNOWN');
    expect(f).not.toHaveProperty('status');
  });

  it('Given DiagnosticAgentError, When normalized, Then own-class code 可信透传', () => {
    const src = new DiagnosticAgentError({
      code: ErrorCode.TIMEOUT, message: 'request timed out', phase: 2, retryable: true,
    });
    const f = normalizeLlmFailure(src);
    expect(Object.isFrozen(f)).toBe(true);
    expect(f.code).toBe('TIMEOUT');
    expect(f.message).toBe('request timed out');
  });

  it('Given string throw, When normalized, Then {message 原文, code=UNKNOWN}', () => {
    const f = normalizeLlmFailure('string throw');
    expect(f.message).toBe('string throw');
    expect(f.code).toBe('UNKNOWN');
    expect(Object.isFrozen(f)).toBe(true);
  });

  it("Given empty-string throw, When normalized, Then 兜底 'LLM adapter failed'", () => {
    const f = normalizeLlmFailure('');
    expect(f.message).toBe('LLM adapter failed');
    expect(f.code).toBe('UNKNOWN');
    expect(Object.isFrozen(f)).toBe(true);
  });
});

describe('normalizeLlmFailure — 敌意值不逃逸（边界）', () => {
  it('Given 敌意 toString（非 Error throw）, When normalized, Then 不抛出且兜底', () => {
    const hostile = {
      toString(): string { throw new Error('hostile toString'); },
    };
    const f = normalizeLlmFailure(hostile);
    expect(f.message).toBe('LLM adapter failed');
    expect(f.code).toBe('UNKNOWN');
    expect(Object.isFrozen(f)).toBe(true);
  });

  it('Given message 访问器抛错的 Error, When normalized, Then 访问器不替换主失败', () => {
    const hostile = new Error('real message');
    Object.defineProperty(hostile, 'message', {
      get() { throw new Error('hostile message getter'); },
      configurable: true,
    });
    const f = normalizeLlmFailure(hostile);
    expect(f.message).toBe('LLM adapter failed');
    expect(f.code).toBe('UNKNOWN');
    expect(Object.isFrozen(f)).toBe(true);
  });
});

describe('normalizeLlmFailure — 跨包拷贝（own failure/code 一致性）', () => {
  it('Given own failure 与 own code 一致, When normalized, Then 信任并冻结携带事实', () => {
    const err = new Error('sdk blew up');
    const carrier = err as Error & { failure?: unknown; code?: string };
    carrier.failure = { message: 'quota blown', code: 'QUOTA', status: 429, requestId: 'req-1' };
    carrier.code = 'QUOTA';
    const f = normalizeLlmFailure(err);
    expect(Object.isFrozen(f)).toBe(true);
    expect(f.code).toBe('QUOTA');
    expect(f.message).toBe('quota blown');
    expect(f.status).toBe(429);
    expect(f.requestId).toBe('req-1');
  });

  it('Given own failure 与 own code 不一致, When normalized, Then 不信任拷贝并回落 UNKNOWN', () => {
    const err = new Error('cross-package copy');
    const carrier = err as Error & { failure?: unknown; code?: string };
    carrier.failure = { message: 'claims quota', code: 'QUOTA', status: 402 };
    carrier.code = 'SOME_SDK_CODE';
    const f = normalizeLlmFailure(err);
    expect(f.code).toBe('UNKNOWN');
    expect(f.message).toBe('cross-package copy');
    expect(f).not.toHaveProperty('status');
  });

  it('Given 非法 carried 快照（空 message + 越界 status）, When normalized, Then 快照作废回落', () => {
    const err = new Error('bad snapshot');
    const carrier = err as Error & { failure?: unknown; code?: string };
    carrier.failure = { message: '', code: 'X', status: 99 };
    carrier.code = 'X';
    const f = normalizeLlmFailure(err);
    expect(f.code).toBe('UNKNOWN');
    expect(f.message).toBe('bad snapshot');
    expect(Object.isFrozen(f)).toBe(true);
  });
});

// ═══ 2. 合一 detail 正则分类 ═══

describe('isContextWindowExceededError — 合一 detail 正则', () => {
  it('Given 结构化 context 超限措辞, Then 命中', () => {
    expect(isContextWindowExceededError('400 context_length_exceeded')).toBe(true);
    expect(isContextWindowExceededError('context window overflowed for model m-1')).toBe(true);
    expect(isContextWindowExceededError("This model's maximum context length is 8192 tokens")).toBe(true);
  });

  it('Given too-large-for-context 措辞, Then 命中', () => {
    expect(isContextWindowExceededError('prompt too large for the model context window')).toBe(true);
    expect(isContextWindowExceededError('request too long for this model')).toBe(true);
    expect(isContextWindowExceededError('提示：上下文长度超出限制')).toBe(true);
  });

  it('Given 非 context 失败, Then 不误报', () => {
    expect(isContextWindowExceededError('rate limit exceeded, try again in 20s')).toBe(false);
    expect(isContextWindowExceededError('insufficient quota, please top up')).toBe(false);
    expect(isContextWindowExceededError('invalid api key')).toBe(false);
  });

  it('Given 合一 detail（code+type+message 拼串）, Then code 槽位单独可命中', () => {
    const hit = ['context_length_exceeded', 'BadRequestError', '400 bad request'].join(' ');
    const miss = ['BadRequestError', '400', 'the request is invalid'].join(' ');
    expect(isContextWindowExceededError(hit)).toBe(true);
    expect(isContextWindowExceededError(miss)).toBe(false);
  });
});

describe('isQuotaExceededError — 合一 detail 正则', () => {
  it('Given 终态配额/余额措辞, Then 命中', () => {
    expect(isQuotaExceededError('402 insufficient_quota')).toBe(true);
    expect(isQuotaExceededError('exceeded your current quota, check plan and billing')).toBe(true);
    expect(isQuotaExceededError('balance_depleted')).toBe(true);
    expect(isQuotaExceededError('You have run out of budget')).toBe(true);
  });

  it('Given 瞬态限速或非配额失败, Then 不误报', () => {
    expect(isQuotaExceededError('rate limit exceeded, try again in 20s')).toBe(false);
    expect(isQuotaExceededError('context length exceeded')).toBe(false);
    expect(isQuotaExceededError('try again in 20 seconds')).toBe(false);
  });

  it('Given 合一 detail（code+type+message 拼串）, Then message 槽位可命中', () => {
    const hit = ['RequestError', 'HTTP 402', 'insufficient balance'].join(' ');
    const miss = ['RequestError', 'HTTP 429', 'too many requests'].join(' ');
    expect(isQuotaExceededError(hit)).toBe(true);
    expect(isQuotaExceededError(miss)).toBe(false);
  });
});

// ═══ 3. canonical 码对齐 — adapter 分类路径（src/providers/base.ts 接线） ═══

describe('adapter 分类路径 — EMPTY_RESPONSE（assembler 侧）', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('Given 200 但 content 为空, When chat, Then EMPTY_RESPONSE（可安全重试）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ choices: [{ message: { content: '' } }], model: 'm-1' }),
      { status: 200 },
    )));
    const provider = createOpenAICompatibleProvider({
      name: 'unit-empty', baseUrl: 'https://unit.test', model: 'm-1',
      apiKey: 'k-1', getHeaders: () => ({}),
    });
    let caught: unknown;
    try { await provider.chat(MSG); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(DiagnosticAgentError);
    const diag = caught as DiagnosticAgentError;
    expect(diag.code).toBe(ErrorCode.EMPTY_RESPONSE);
    expect(diag.retryable).toBe(true);
  });
});

describe('adapter 分类路径 — INVALID_CREDENTIAL 语义（api-key 侧）', () => {
  it('Given API Key 为空串（供了但不可用）, When chat, Then AUTH_FAILED + 轮换 + 不重试', async () => {
    const provider = createOpenAICompatibleProvider({
      name: 'unit-key', baseUrl: 'https://unit.test', model: 'm-1',
      apiKey: '', getHeaders: () => ({}),
    });
    let caught: unknown;
    try { await provider.chat(MSG); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(DiagnosticAgentError);
    const diag = caught as DiagnosticAgentError;
    expect(diag.code).toBe(ErrorCode.AUTH_FAILED);
    expect(diag.retryable).toBe(false);
    expect(diag.shouldRotateCredential).toBe(true);
  });
});

describe('adapter 最终 throw 边界 — normalizeLlmFailure + 合一分类接线', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('Given fetch 抛 context 超限错误, When chat, Then CONTEXT_OVERFLOW + compress + cause 保留', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error("This model's maximum context length is 8192 tokens");
    }));
    const provider = createOpenAICompatibleProvider({
      name: 'unit-ctx', baseUrl: 'https://unit.test', model: 'm-1',
      apiKey: 'k-1', getHeaders: () => ({}),
    });
    let caught: unknown;
    try { await provider.chat(MSG); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(DiagnosticAgentError);
    const diag = caught as DiagnosticAgentError;
    expect(diag.code).toBe(ErrorCode.CONTEXT_OVERFLOW);
    expect(diag.shouldCompress).toBe(true);
    expect(diag.retryable).toBe(true);
  });

  it('Given fetch 抛配额耗尽错误, When chat, Then BILLING_EXCEEDED + 轮换 + 不重试', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('402 payment required: insufficient_quota');
    }));
    const provider = createOpenAICompatibleProvider({
      name: 'unit-quota', baseUrl: 'https://unit.test', model: 'm-1',
      apiKey: 'k-1', getHeaders: () => ({}),
    });
    let caught: unknown;
    try { await provider.chat(MSG); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(DiagnosticAgentError);
    const diag = caught as DiagnosticAgentError;
    expect(diag.code).toBe(ErrorCode.BILLING_EXCEEDED);
    expect(diag.retryable).toBe(false);
    expect(diag.shouldRotateCredential).toBe(true);
  });

  it('Given fetch 抛已分类 DiagnosticAgentError, When chat, Then capability seam 原样透传', async () => {
    const seam = new DiagnosticAgentError({
      code: ErrorCode.RATE_LIMITED, message: '429 slow down', phase: 2, retryable: true,
    });
    vi.stubGlobal('fetch', vi.fn(async () => { throw seam; }));
    const provider = createOpenAICompatibleProvider({
      name: 'unit-seam', baseUrl: 'https://unit.test', model: 'm-1',
      apiKey: 'k-1', getHeaders: () => ({}),
    });
    let caught: unknown;
    try { await provider.chat(MSG); } catch (e) { caught = e; }
    expect(caught).toBe(seam);
    expect((caught as DiagnosticAgentError).code).toBe(ErrorCode.RATE_LIMITED);
    expect((caught as DiagnosticAgentError).phase).toBe(2);
  });

  it('Given fetch 抛 context 超限错误, When stream, Then onError 收到 CONTEXT_OVERFLOW', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('prompt is too long for this model context');
    }));
    const provider = createOpenAICompatibleProvider({
      name: 'unit-stream', baseUrl: 'https://unit.test', model: 'm-1',
      apiKey: 'k-1', getHeaders: () => ({}),
    });
    const seen: Error[] = [];
    await provider.stream(MSG, { onToken: () => {}, onError: (e) => seen.push(e) });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBeInstanceOf(DiagnosticAgentError);
    expect((seen[0] as DiagnosticAgentError).code).toBe(ErrorCode.CONTEXT_OVERFLOW);
  });
});
