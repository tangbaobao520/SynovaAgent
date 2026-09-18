/**
 * tests/agent/tool-loop-executor-resilience.integration.test.ts — D810 生产调用链接线
 *
 * 被测对象 = **真实生产类** `ToolLoopExecutor`（ConversationEngine 的 LLM 工具循环），
 * 不 mock 管线（铁律 12）：只替换 provider 这一外部传输边界。
 *
 * 覆盖（铁律 48: 正常 / 降级 / 边界）:
 *   ① 正常路径: provider 直接成功 → 内容透传，单次调用
 *   ② **重试活体证据（断开→必红）**: 首次可重试失败 → 第二次成功；`chatCalls === 2`。
 *      —— 若把 `callWithResilience` 换回直连 `provider.chat`，首次异常会进 catch 立即返回
 *      「抱歉，调用失败…」，chatCalls 恒为 1 → 本用例断言必红（接线断开物理证明）。
 *   ③ 降级路径（协作式，不抛）: provider 挂起 → 截止超时 → 返回降级文案且含 TOOL_TIMEOUT 码，
 *      方法本身不抛异常（主循环不被裸异常打断）
 *   ④ 重试事件落盘: onRetry → appendRetryEvent → D500 事件流出现 kind='llm_retry' 事件
 *      （store/retry-projection 的生产调用点证据）
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { ToolLoopExecutor } from '../../src/agent/tool-loop-executor';
import type { EngineContext } from '../../src/agent/engine-context';
import { ToolRegistry } from '../../src/agent/tools';
import { SessionStore } from '../../src/store/session-store';
import type { DiagnosisEngine } from '../../src/l2-interfaces/diagnosis-engine';
import { DiagnosticAgentError, ErrorCode } from '../../src/errors/types';
import type { ChatOptions, ChatResult, LLMMessage, LLMProvider, StreamCallback } from '../../src/providers/types';

// ═══ provider 替身（仅外部传输边界；其余全走生产代码） ═══

interface RecordingProvider extends LLMProvider {
  chatCalls: number;
}

function stubProvider(impl: (messages: LLMMessage[], options?: ChatOptions) => Promise<ChatResult>): RecordingProvider {
  return {
    name: 'stub-toolloop',
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

/** 挂起直到 signal abort（deadline 真实触发路径） */
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

function noopEngine(): DiagnosisEngine {
  return {
    async runConsultation(teamId) {
      return { teamId, report: {}, totalDurationMs: 0, degradedModules: [] };
    },
  };
}

function makeCtx(provider: LLMProvider, extra: { sessionStore?: SessionStore; sessionId?: string } = {}): EngineContext {
  const ctx: EngineContext = {
    provider,
    messages: [{ role: 'system', content: 'sys' }],
    orgId: 'org-d810',
    sessionId: extra.sessionId ?? '',
    toolRegistry: new ToolRegistry(),
    hookRunner: null,
    eventBus: null,
    evidenceCollector: null,
    corroborationEngine: null,
    graphBridge: null,
    graphStore: null,
    flags: { enableCommunityReports: false, enableEntityResolution: false },
    loggerPrefix: 'test',
    diagnosisEngine: noopEngine(),
  };
  if (extra.sessionStore) ctx.sessionStore = extra.sessionStore;
  return ctx;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('D810 ToolLoopExecutor — 生产调用链接线', () => {
  it('① 正常路径: provider 成功 → 内容透传且单次调用', async () => {
    const provider = stubProvider(async () => ({ content: 'hello', model: 'stub-model' }));
    const executor = new ToolLoopExecutor(makeCtx(provider));

    const reply = await executor.callLLMWithTools();

    expect(reply).toBe('hello');
    expect(provider.chatCalls).toBe(1);
  });

  it('② 重试活体证据（断开→必红）: 首次可重试失败 → 重试成功，chatCalls === 2', async () => {
    const provider = stubProvider(async () => {
      if (provider.chatCalls === 1) {
        throw new DiagnosticAgentError({ code: ErrorCode.RATE_LIMITED, message: '429 rate limited', phase: 2, retryable: true });
      }
      return { content: 'recovered-after-retry', model: 'stub-model' };
    });
    const executor = new ToolLoopExecutor(makeCtx(provider));

    const reply = await executor.callLLMWithTools();

    expect(reply).toBe('recovered-after-retry');
    // 直连 provider.chat 时：首次异常直接进 catch → reply='抱歉，调用失败…' 且 chatCalls=1 → 两断言皆红
    expect(provider.chatCalls).toBe(2);
  });

  it('③ 协作式超时: provider 挂起 → 降级文案含 TOOL_TIMEOUT 且不抛异常', async () => {
    vi.useFakeTimers();
    const provider = stubProvider(hangUntilAborted);
    const executor = new ToolLoopExecutor(makeCtx(provider));

    const pending = executor.callLLMWithTools();
    await vi.advanceTimersByTimeAsync(120_000 + 1_000); // 默认 totalTimeoutMs = 120s（DEFAULT_LLM_CALL_OPTIONS）
    const reply = await pending;

    expect(reply).toContain('抱歉，调用失败');
    expect(reply).toContain('TOOL_TIMEOUT');
    expect(provider.chatCalls).toBe(1); // 截止超时不重试（调用方耐心预算耗尽）
  });

  it('④ 重试事件落盘: onRetry → appendRetryEvent → D500 事件流 kind=llm_retry', async () => {
    const provider = stubProvider(async () => {
      if (provider.chatCalls === 1) {
        throw new DiagnosticAgentError({ code: ErrorCode.RATE_LIMITED, message: '429 rate limited', phase: 2, retryable: true });
      }
      return { content: 'ok', model: 'stub-model' };
    });
    const db = new Database(':memory:');
    const store = new SessionStore(db);
    const session = store.createSession('org-d810');
    const executor = new ToolLoopExecutor(makeCtx(provider, { sessionStore: store, sessionId: session.id }));

    await executor.callLLMWithTools();

    const events = store.getEvents(session.id);
    const retryEvents = events.filter(e => e.eventType === 'system' && e.payloadJson.includes('llm_retry'));
    expect(retryEvents).toHaveLength(1);
    expect(JSON.parse(retryEvents[0].payloadJson)).toMatchObject({
      kind: 'llm_retry', provider: 'stub-toolloop', code: 'RATE_LIMITED', mode: 'chat',
    });
    db.close();
  });
});
