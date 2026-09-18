/**
 * tests/llm/resilient-chat-adapter.test.ts — D810 协作式 LLM 适配器缝（B-02 重试 / B-06 超时）
 *
 * 覆盖（铁律 48: 正常 / 降级 / 边界，每用例 ≥2 expect）:
 *   - 正常路径: content/toolCalls/usage 透传到 L3 LLMClient 形状
 *   - 重试路径: 可重试失败 → 退避重试成功（attempt 计数 = 接线活体证据；断开即红）
 *   - 降级路径 ①: 截止超时 → TOOL_TIMEOUT 分类错误（**不抛裸异常**，code 可路由）
 *   - 降级路径 ②: 不可重试错误 → 立即分类错误（不重试，attempts=1）
 *   - 边界: 未知 message role → INVALID_MESSAGE_ROLE fail-fast（不静默降级为 user）
 *   - onRetry 回调: 重试事件外抛（生产侧落 D500 事件流的缝）
 */
import { describe, it, expect } from 'vitest';
import type { ChatOptions, ChatResult, LLMMessage, LLMProvider, StreamCallback } from '../../src/providers/types';
import { DiagnosticAgentError, ErrorCode } from '../../src/errors/types';
import { createResilientChatAdapter, LlmResilienceError } from '../../src/llm/resilient-chat-adapter';
import type { LlmRetryEvent } from '../../src/llm/retry-middleware';

type ChatImpl = (messages: LLMMessage[], options?: ChatOptions) => Promise<ChatResult>;

interface RecordingProvider extends LLMProvider {
  chatCalls: number;
}

function stubProvider(impl: ChatImpl): RecordingProvider {
  return {
    name: 'stub-adapter',
    baseUrl: 'https://stub.invalid',
    chatCalls: 0,
    async chat(messages, options) {
      this.chatCalls += 1;
      return impl(messages, options);
    },
    async stream(_messages: LLMMessage[], _callback: StreamCallback, _options?: ChatOptions): Promise<void> {
      throw new Error('stream not used in this suite');
    },
    listModels: () => ['stub-model'],
    healthCheck: async () => ({ ok: true }),
  };
}

/** 挂起直到 signal abort（deadline 真实触发路径，不伪造计时器） */
function hangUntilAborted(_messages: LLMMessage[], options?: ChatOptions): Promise<ChatResult> {
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

const MESSAGES = [{ role: 'user', content: 'ping' }];

describe('D810 createResilientChatAdapter — 正常路径', () => {
  it('Given 正常 provider, When chat, Then content/toolCalls/usage 透传且只调用一次', async () => {
    const provider = stubProvider(async () => ({
      content: 'pong',
      model: 'stub-model',
      usage: { promptTokens: 10, completionTokens: 2, totalTokens: 12 },
      toolCalls: [{ function: { name: 'lookup', arguments: '{"q":"x"}' } }],
    }));
    const adapter = createResilientChatAdapter(provider);

    const result = await adapter.chat(MESSAGES);

    expect(result.content).toBe('pong');
    expect(result.model).toBe('stub-model');
    expect(result.usage?.totalTokens).toBe(12);
    expect(result.toolCalls).toEqual([{ name: 'lookup', arguments: { q: 'x' } }]);
    expect(provider.chatCalls).toBe(1);
  });

  it('Given tools 选项, When chat, Then tools 原样透传到 provider（D810 pickChatOptions 修复）', async () => {
    let seenTools: unknown;
    const provider = stubProvider(async (_messages, options) => {
      seenTools = options?.tools;
      return { content: 'ok', model: 'stub-model' };
    });
    const adapter = createResilientChatAdapter(provider);
    const tools = [{ type: 'function', function: { name: 'lookup', description: 'd', parameters: {} } }];

    await adapter.chat(MESSAGES, { tools });

    expect(seenTools).toEqual(tools);
    expect(provider.chatCalls).toBe(1);
  });
});

describe('D810 createResilientChatAdapter — 重试（B-02 活体证据）', () => {
  it('Given 首次可重试失败, When chat, Then 重试成功且 attempts 计数 ≥2', async () => {
    const provider = stubProvider(async () => {
      if (provider.chatCalls === 1) {
        throw new DiagnosticAgentError({ code: ErrorCode.RATE_LIMITED, message: '429 rate limited', phase: 2, retryable: true });
      }
      return { content: 'recovered', model: 'stub-model' };
    });
    const adapter = createResilientChatAdapter(provider, { retryableCodes: ['RATE_LIMITED'], initialDelayMs: 5, maxDelayMs: 10 });

    const result = await adapter.chat(MESSAGES);

    expect(result.content).toBe('recovered');
    // 断开接线（直连 provider.chat）时此值恒为 1 → 断言必红
    expect(provider.chatCalls).toBe(2);
  });

  it('Given 可重试失败, When chat, Then onRetry 外抛事件（落 D500 事件流的缝）', async () => {
    const events: LlmRetryEvent[] = [];
    const provider = stubProvider(async () => {
      if (provider.chatCalls === 1) {
        throw new DiagnosticAgentError({ code: ErrorCode.RATE_LIMITED, message: '429 rate limited', phase: 2, retryable: true });
      }
      return { content: 'ok', model: 'stub-model' };
    });
    const adapter = createResilientChatAdapter(provider, {
      retryableCodes: ['RATE_LIMITED'], initialDelayMs: 5, maxDelayMs: 10,
      onRetry: (e) => { events.push(e); },
    });

    await adapter.chat(MESSAGES);

    expect(events).toHaveLength(1);
    expect(events[0].code).toBe('RATE_LIMITED');
    expect(events[0].mode).toBe('chat');
  });
});

describe('D810 createResilientChatAdapter — 降级路径', () => {
  it('Given provider 挂起, When 截止超时, Then TOOL_TIMEOUT 分类错误（非裸异常）且可路由', async () => {
    const provider = stubProvider(hangUntilAborted);
    const adapter = createResilientChatAdapter(provider, { totalTimeoutMs: 20, maxRetries: 0 });

    const err = await adapter.chat(MESSAGES).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(LlmResilienceError);
    const failure = err as LlmResilienceError;
    expect(failure.code).toBe('TOOL_TIMEOUT');
    expect(failure.phase).toBe('llm-resilience');
    expect(failure.retryable).toBe(false);
    expect(failure.attempts).toBe(1);
    expect(provider.chatCalls).toBe(1);
  });

  it('Given 不可重试错误(401), When chat, Then 立即分类错误不重试', async () => {
    const provider = stubProvider(async () => {
      throw new DiagnosticAgentError({ code: ErrorCode.AUTH_FAILED, message: '401 unauthorized', phase: 2, retryable: false });
    });
    const adapter = createResilientChatAdapter(provider, { initialDelayMs: 5, maxDelayMs: 10 });

    const err = await adapter.chat(MESSAGES).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(LlmResilienceError);
    expect((err as LlmResilienceError).code).toBe('AUTH_FAILED');
    expect((err as LlmResilienceError).retryable).toBe(false);
    expect(provider.chatCalls).toBe(1);
  });
});

describe('D810 createResilientChatAdapter — 边界', () => {
  it('Given 未知 message role, When chat, Then INVALID_MESSAGE_ROLE fail-fast（不静默降级）', async () => {
    const provider = stubProvider(async () => ({ content: 'never', model: 'stub-model' }));
    const adapter = createResilientChatAdapter(provider);

    const err = await adapter.chat([{ role: 'developer', content: 'x' }]).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(LlmResilienceError);
    expect((err as LlmResilienceError).code).toBe('INVALID_MESSAGE_ROLE');
    expect(provider.chatCalls).toBe(0);
  });
});
