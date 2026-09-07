/**
 * tests/llm/call-resilience.test.ts — D593 LLM 调用韧性层（DSH 借鉴卡 B-02+B-06）
 *
 * 范式锚点（0.1.1-rc.2，逐行读全文自研，零代码依赖）:
 *   D:/deepseek-harness/packages/llm/llm-retry/lib/index.js（localDelay 公式 + retry 载荷）
 *   D:/deepseek-harness/packages/llm/llm/lib/types/retry-policy.js（schema 校验 + 冻结策略）
 *
 * 覆盖（铁律 48: 正常/降级/边界，每用例 ≥3 expect）:
 *   - EMPTY_RESPONSE 可重试（成功路径 + onRetry 载荷）  - AUTH_FAILED 不重试（立即 outcome）
 *   - 可重试耗尽 → error outcome（非抛异常）           - 截止超时 → TOOL_TIMEOUT 结果化（非抛异常）
 *   - resolveRetryPolicy: 默认冻结 / provider 注册 > 显式 options > 默认 / schema fail-fast
 *   - localDelay: jitter 上下界 / 指数增长 / maxDelay 封顶（溢出防护）
 *   - streamWithRetry: 空闲超时 TOOL_TIMEOUT / 稳定流成功 / 逐 token pulse 重臂不误杀 / 空闲失败→重试成功
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ChatOptions, ChatResult, LLMMessage, LLMProvider, StreamCallback } from '../../src/providers/types';
import { DiagnosticAgentError, ErrorCode, type ErrorCodeType } from '../../src/errors/types';
import {
  callWithResilience,
  streamWithRetry,
  resolveRetryPolicy,
  localDelay,
  registerProviderRetryPolicy,
  type LlmRetryEvent,
  type ResolvedRetryPolicy,
} from '../../src/llm/retry-middleware';

const MESSAGES: LLMMessage[] = [{ role: 'user', content: 'ping' }];

function okResult(content = 'pong'): ChatResult {
  return { content, model: 'stub-model' };
}

function diagError(code: ErrorCodeType, message: string): DiagnosticAgentError {
  return new DiagnosticAgentError({ code, message, phase: 2, retryable: false });
}

/** 挂起直到 signal abort（deadline/idleWatchdog 真实触发路径） */
function hangUntilAborted(
  messages: LLMMessage[],
  options?: ChatOptions,
): Promise<ChatResult> {
  return new Promise((_resolve, reject) => {
    const signal = options?.signal;
    if (!signal) {
      reject(new Error('expected a signal'));
      return;
    }
    const rejectWithReason = () => {
      reject(signal.reason instanceof Error ? signal.reason : new Error(String(signal.reason)));
    };
    if (signal.aborted) {
      rejectWithReason();
      return;
    }
    signal.addEventListener('abort', rejectWithReason, { once: true });
  });
}

type ChatImpl = (messages: LLMMessage[], options?: ChatOptions) => Promise<ChatResult>;
type StreamImpl = (messages: LLMMessage[], callback: StreamCallback, options?: ChatOptions) => Promise<void>;

interface RecordingProvider extends LLMProvider {
  chatCalls: number;
  streamCalls: number;
}

function stubProvider(impl: { chat?: ChatImpl; stream?: StreamImpl; name?: string }): RecordingProvider {
  return {
    name: impl.name ?? 'stub',
    baseUrl: 'https://stub.invalid',
    chatCalls: 0,
    streamCalls: 0,
    async chat(messages, options) {
      this.chatCalls += 1;
      if (!impl.chat) return okResult();
      return impl.chat(messages, options);
    },
    async stream(messages, callback, options) {
      this.streamCalls += 1;
      if (!impl.stream) {
        callback.onToken('pong');
        return;
      }
      return impl.stream(messages, callback, options);
    },
    async healthCheck() {
      return { healthy: true };
    },
    listModels() {
      return ['stub-model'];
    },
  };
}

/** 流式桩: 按 gapMs 逐 token 发送；signal abort 时以 reason 拒绝（空闲超时真实路径） */
function streamStub(tokens: string[], gapMs: number): StreamImpl {
  return (_messages, callback, options) =>
    new Promise<void>((resolve, reject) => {
      const signal = options?.signal;
      let timer: ReturnType<typeof setTimeout>;
      const rejectOnAbort = () => {
        clearTimeout(timer);
        const reason = signal?.reason;
        reject(reason instanceof Error ? reason : new Error(String(reason)));
      };
      if (signal?.aborted) {
        rejectOnAbort();
        return;
      }
      signal?.addEventListener('abort', rejectOnAbort, { once: true });
      let i = 0;
      const tick = () => {
        if (i < tokens.length) {
          callback.onToken(tokens[i]);
          i += 1;
          timer = setTimeout(tick, gapMs);
          return;
        }
        resolve();
      };
      timer = setTimeout(tick, gapMs);
    });
}

/** 挂起流: 零 token 且永不完成；signal abort 时以 reason 拒绝（空闲超时真实路径） */
function hangStream(): StreamImpl {
  return (_messages, _callback, options) =>
    new Promise<void>((_resolve, reject) => {
      const signal = options?.signal;
      const rejectOnAbort = () => {
        const reason = signal?.reason;
        reject(reason instanceof Error ? reason : new Error(String(reason)));
      };
      if (signal?.aborted) {
        rejectOnAbort();
        return;
      }
      signal?.addEventListener('abort', rejectOnAbort, { once: true });
    });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('D593 callWithResilience — 协作式 outcome（不抛异常）', () => {
  it('EMPTY_RESPONSE 可重试: 两次失败后成功，attempts=3，onRetry 载荷完整', async () => {
    const provider = stubProvider({});
    let call = 0;
    provider.chat = async function chatCall(this: RecordingProvider, _m: LLMMessage[], _o?: ChatOptions) {
      this.chatCalls += 1;
      call += 1;
      if (call <= 2) throw diagError(ErrorCode.EMPTY_RESPONSE, 'stop 但零内容');
      return okResult('recovered');
    };
    const retries: LlmRetryEvent[] = [];
    const outcome = await callWithResilience(provider, MESSAGES, {
      maxRetries: 3,
      initialDelayMs: 1,
      maxDelayMs: 4,
      onRetry: (event) => retries.push(event),
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.content).toBe('recovered');
      expect(outcome.attempts).toBe(3);
    }
    expect(provider.chatCalls).toBe(3);
    expect(retries).toHaveLength(2);
    expect(retries[0].code).toBe('EMPTY_RESPONSE');
    expect(retries[0].provider).toBe('stub');
    expect(retries[0].attempt).toBe(0);
    expect(retries[0].delayMs).toBeGreaterThan(0);
    expect(retries[1].attempt).toBe(1);
  });

  it('AUTH_FAILED 不重试: 立即返回 error outcome（非抛异常），单次调用', async () => {
    const provider = stubProvider({
      chat: async () => {
        throw diagError(ErrorCode.AUTH_FAILED, 'invalid api key');
      },
    });
    const outcome = await callWithResilience(provider, MESSAGES, {
      maxRetries: 3,
      initialDelayMs: 1,
      maxDelayMs: 4,
      retryableCodes: ['EMPTY_RESPONSE', 'RATE_LIMITED', 'SERVER_ERROR', 'TIMEOUT', 'NETWORK'],
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.kind).toBe('error');
      expect(outcome.code).toBe('AUTH_FAILED');
      expect(outcome.retryable).toBe(false);
      expect(outcome.degraded).toBe(true);
      expect(outcome.attempts).toBe(1);
    }
    expect(provider.chatCalls).toBe(1);
  });

  it('可重试耗尽: EMPTY_RESPONSE 持续失败 → error outcome 携带 attempts=maxRetries+1', async () => {
    const provider = stubProvider({
      chat: async () => {
        throw diagError(ErrorCode.EMPTY_RESPONSE, 'still empty');
      },
    });
    const outcome = await callWithResilience(provider, MESSAGES, {
      maxRetries: 2,
      initialDelayMs: 1,
      maxDelayMs: 4,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.kind).toBe('error');
      expect(outcome.code).toBe('EMPTY_RESPONSE');
      expect(outcome.retryable).toBe(true);
      expect(outcome.degraded).toBe(true);
      expect(outcome.attempts).toBe(3);
    }
    expect(provider.chatCalls).toBe(3);
  });

  it('截止超时: provider 挂起 → TOOL_TIMEOUT 结果化（非抛异常），degraded', async () => {
    const provider = stubProvider({ chat: hangUntilAborted });
    const outcome = await callWithResilience(provider, MESSAGES, {
      totalTimeoutMs: 25,
      maxRetries: 2,
      initialDelayMs: 1,
      maxDelayMs: 4,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.kind).toBe('timeout');
      expect(outcome.code).toBe('TOOL_TIMEOUT');
      expect(outcome.degraded).toBe(true);
      expect(outcome.message).toContain('TOOL_TIMEOUT after 25ms');
      expect(outcome.attempts).toBe(1);
    }
    expect(provider.chatCalls).toBe(1);
  });
});

describe('D593 resolveRetryPolicy — 显式 options > provider 注册策略 > 默认，schema fail-fast', () => {
  it('默认策略: 冻结 + Synova ErrorCode 词汇 + DSH 数值默认', () => {
    const policy = resolveRetryPolicy();
    expect(Object.isFrozen(policy)).toBe(true);
    expect(policy.maxRetries).toBe(3);
    expect(policy.initialDelayMs).toBe(500);
    expect(policy.maxDelayMs).toBe(10_000);
    expect(policy.jitterRatio).toBeGreaterThanOrEqual(0);
    expect(policy.jitterRatio).toBeLessThanOrEqual(1);
    expect(policy.retryableCodes).toContain('EMPTY_RESPONSE');
    expect(policy.retryableCodes).toContain('RATE_LIMITED');
    expect(policy.retryableCodes).toContain('SERVER_ERROR');
    expect(policy.retryableCodes).toContain('TIMEOUT');
    expect(policy.retryableCodes).toContain('NETWORK');
  });

  it('优先级: 显式 options > provider 注册策略 > 默认', () => {
    registerProviderRetryPolicy('prov-resilience-a', { maxRetries: 5, initialDelayMs: 50 });
    const fromProvider = resolveRetryPolicy({ providerName: 'prov-resilience-a' });
    expect(fromProvider.maxRetries).toBe(5);
    expect(fromProvider.initialDelayMs).toBe(50);
    const explicitWins = resolveRetryPolicy({ providerName: 'prov-resilience-a', maxRetries: 2 });
    expect(explicitWins.maxRetries).toBe(2);
    const fallback = resolveRetryPolicy({ providerName: 'never-registered' });
    expect(fallback.maxRetries).toBe(3);
  });

  it('schema fail-fast: jitter 越界 / delay 非正 / initial>max / 码表空·重复·空串', () => {
    expect(() => resolveRetryPolicy({ jitterRatio: 1.5 })).toThrow(/jitterRatio/);
    expect(() => resolveRetryPolicy({ jitterRatio: -0.1 })).toThrow(/jitterRatio/);
    expect(() => resolveRetryPolicy({ initialDelayMs: 0 })).toThrow(/initialDelayMs/);
    expect(() => resolveRetryPolicy({ initialDelayMs: 20_000, maxDelayMs: 10_000 })).toThrow(/initialDelayMs/);
    expect(() => resolveRetryPolicy({ retryableCodes: [] })).toThrow(/retryableCodes/);
    expect(() => resolveRetryPolicy({ retryableCodes: ['A', 'A'] })).toThrow(/retryableCodes/);
    expect(() => resolveRetryPolicy({ retryableCodes: ['A', ''] })).toThrow(/retryableCodes/);
    expect(() => resolveRetryPolicy({ maxDelayMs: Number.MAX_SAFE_INTEGER })).not.toThrow();
    expect(resolveRetryPolicy({ maxDelayMs: Number.MAX_SAFE_INTEGER }).maxDelayMs).toBeLessThanOrEqual(2_147_483_647);
  });
});

describe('D593 localDelay — DSH 指数+jitter 公式', () => {
  const policy: ResolvedRetryPolicy = Object.freeze({
    maxRetries: 3,
    initialDelayMs: 100,
    maxDelayMs: 1_000,
    jitterRatio: 0.1,
    retryableCodes: Object.freeze(['TIMEOUT']),
  });

  it('random 边界: 0 → 抖动下界 initial*(1-jr)，1 → 上界 initial*(1+jr)', () => {
    expect(localDelay(policy, 1, () => 0)).toBe(90);
    expect(localDelay(policy, 1, () => 1)).toBeCloseTo(110, 10);
    expect(localDelay(policy, 2, () => 0.5)).toBe(200);
  });

  it('指数增长 + maxDelay 封顶（retry 巨大时溢出安全，≤ MAX_TIMER_DELAY 语义）', () => {
    expect(localDelay(policy, 3, () => 0.5)).toBe(400);
    expect(localDelay(policy, 4, () => 0.5)).toBe(800);
    expect(localDelay(policy, 5, () => 0.5)).toBe(1_000);
    expect(localDelay(policy, 2_000, () => 0.5)).toBe(1_000);
    expect(localDelay(policy, 2_000, () => 0)).toBeLessThanOrEqual(1_000);
  });
});

describe('D593 streamWithRetry — idleWatchdog 包流 + 逐 token pulse', () => {
  it('空闲超时: 流零 token 挂起 → TOOL_TIMEOUT 结果化（非抛异常）', async () => {
    const provider = stubProvider({ stream: hangStream() });
    const tokens: string[] = [];
    const outcome = await streamWithRetry(provider, MESSAGES, (t) => tokens.push(t), {
      idleTimeoutMs: 20,
      maxRetries: 0,
      initialDelayMs: 1,
      maxDelayMs: 4,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.kind).toBe('timeout');
      expect(outcome.code).toBe('TOOL_TIMEOUT');
      expect(outcome.degraded).toBe(true);
      expect(outcome.attempts).toBe(1);
    }
    expect(tokens).toEqual([]);
    expect(provider.streamCalls).toBe(1);
  });

  it('稳定流成功: 全 token 送达 + attempts=1（正常路径）', async () => {
    const provider = stubProvider({ stream: streamStub(['a', 'b', 'c'], 3) });
    const tokens: string[] = [];
    const outcome = await streamWithRetry(provider, MESSAGES, (t) => tokens.push(t), {
      idleTimeoutMs: 200,
      maxRetries: 1,
      initialDelayMs: 1,
      maxDelayMs: 4,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.attempts).toBe(1);
    expect(tokens).toEqual(['a', 'b', 'c']);
    expect(provider.streamCalls).toBe(1);
  });

  it('逐 token pulse 重臂: token 间隔 × 数量 总时长超过单个 idle 窗口仍不误杀', async () => {
    const provider = stubProvider({ stream: streamStub(['t1', 't2', 't3', 't4', 't5', 't6'], 12) });
    const tokens: string[] = [];
    const outcome = await streamWithRetry(provider, MESSAGES, (t) => tokens.push(t), {
      idleTimeoutMs: 30,
      maxRetries: 0,
      initialDelayMs: 1,
      maxDelayMs: 4,
    });
    expect(outcome.ok).toBe(true);
    expect(tokens).toHaveLength(6);
    expect(tokens[0]).toBe('t1');
    expect(provider.streamCalls).toBe(1);
  });

  it('首次流空闲失败 → 重试成功: attempts=2，onRetry 携带 TOOL_TIMEOUT', async () => {
    const provider = stubProvider({});
    let call = 0;
    provider.stream = async function streamCall(
      this: RecordingProvider,
      m: LLMMessage[],
      cb: StreamCallback,
      o?: ChatOptions,
    ) {
      this.streamCalls += 1;
      call += 1;
      if (call === 1) return hangStream()(m, cb, o);
      return streamStub(['only-second'], 4)(m, cb, o);
    };
    const tokens: string[] = [];
    const retries: LlmRetryEvent[] = [];
    const outcome = await streamWithRetry(provider, MESSAGES, (t) => tokens.push(t), {
      idleTimeoutMs: 20,
      maxRetries: 2,
      initialDelayMs: 1,
      maxDelayMs: 4,
      onRetry: (event) => retries.push(event),
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.attempts).toBe(2);
    expect(tokens).toEqual(['only-second']);
    expect(retries).toHaveLength(1);
    expect(retries[0].code).toBe('TOOL_TIMEOUT');
    expect(retries[0].mode).toBe('stream');
    expect(provider.streamCalls).toBe(2);
  });
});
