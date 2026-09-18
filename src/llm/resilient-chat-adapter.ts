/**
 * llm/resilient-chat-adapter.ts — 协作式 LLM 适配器缝（D810 接线）
 *
 * 为什么存在（M3 未接线修复）:
 *   L3 诊断引擎经 `LLMClient` 接口调用 LLM——routes 装配点把 provider 适配成 `{ chat }`。
 *   装配点原先直连 `provider.chat`：零重试、零超时、失败无分类码（K3 D808 P0-1）。
 *   本缝把该装配点收敛为一处，并接到 `callWithResilience`（D593 韧性层 B-02/B-06）。
 *
 * 契约（铁律 47）:
 *   @input  — provider（LLMProvider）+ 可选 ResilienceOptions
 *             （策略片段 / totalTimeoutMs / providerName / signal / onRetry）
 *   @output — chat(messages, options) 成功 → { content, toolCalls?, usage?, model }
 *             失败 → 抛 LlmResilienceError（code + phase + retryable，铁律 32）
 *   @degraded — 本层不静默吞: `callWithResilience` 的 outcome.code 原样进 error.code，
 *               消费方按 code 路由（绝不解析 message——21-1 口径）。超时归类 TOOL_TIMEOUT。
 *
 * 协作式与抛异常的分工（DSH `dsh-tool-call-timeout-policy` 范式）:
 *   - 韧性原语层（`callWithResilience` / `streamWithRetry`）**永不抛**，返回带 code 的 outcome；
 *   - 消费方分两类：能直接吃 outcome 的（如 ToolLoopExecutor）就地按 code 降级、不抛；
 *     接口契约只允许"返回或抛"的（L3 LLMClient 接口），由本缝转成**分类错误**——
 *     错误对象携带稳定 code/retryable，调用方既有 catch 分支按对象路由，不丢分类码。
 */
import type { LLMProvider, LLMMessage, ChatResult, ChatOptions } from '../providers/types';
import { callWithResilience, type ResilienceOptions } from './retry-middleware';
import { createLogger } from '@synova/logger';

const log = createLogger('llm/resilient-chat-adapter');

/** 分类失败错误（铁律 32）: code 取自韧性层 outcome，phase 固定本缝，retryable 指示可否重试 */
export class LlmResilienceError extends Error {
  readonly code: string;
  readonly phase = 'llm-resilience';
  readonly retryable: boolean;
  readonly attempts: number;

  constructor(code: string, message: string, retryable: boolean, attempts: number) {
    super(message);
    this.name = 'LlmResilienceError';
    this.code = code;
    this.retryable = retryable;
    this.attempts = attempts;
  }
}

/** 适配器输出（= L3 LLMClient.chat 的返回形状 + D598 usage 透传） */
export interface ResilientChatResult {
  content: string;
  toolCalls?: Array<{ name: string; arguments: Record<string, unknown> }>;
  usage?: ChatResult['usage'];
  model?: string;
}

/** 适配器输入消息（L3 LLMClient 口径: role 为宽字符串，此处 fail-closed 收敛为 LLMMessage） */
export interface AdapterMessage {
  role: string;
  content: string;
}

/** 适配器选项（reasoningEffort 等 ChatOptions 字段经 ResilienceOptions 透传） */
export interface ResilientChatAdapterOptions extends ResilienceOptions {
  /** 请求级 ChatOptions 片段（与调用点 options 合并，调用点优先） */
  chatOptions?: ChatOptions;
}

export interface ResilientChatAdapter {
  chat(messages: AdapterMessage[], options?: { tools?: Array<Record<string, unknown>> }): Promise<ResilientChatResult>;
}

/** role 收敛: 四类合法角色原样通过；未知角色 fail-fast（不静默降级为 user——铁律 11） */
function toLlmMessages(messages: AdapterMessage[]): LLMMessage[] {
  return messages.map((m) => {
    if (m.role !== 'system' && m.role !== 'user' && m.role !== 'assistant' && m.role !== 'tool') {
      throw new LlmResilienceError('INVALID_MESSAGE_ROLE', `unsupported message role "${m.role}"`, false, 0);
    }
    return { role: m.role, content: m.content };
  });
}

/** ChatResult → 适配器输出（toolCalls 参数解析失败按 provider 原始行为抛出，不吞） */
function toAdapterResult(result: ChatResult): ResilientChatResult {
  return {
    content: result.content,
    toolCalls: result.toolCalls?.map(tc => ({
      name: tc.function.name,
      arguments: JSON.parse(tc.function.arguments) as Record<string, unknown>,
    })),
    usage: result.usage,
    model: result.model,
  };
}

/**
 * 构造韧性适配器（L1 装配点唯一入口）。
 * @degraded — 失败不是静默降级：log.warn 带 code/kind/attempts/degraded:true 后抛分类错误，
 *             调用方（诊断引擎）既有 catch 分支落 `degradedModules` + error 事件。
 */
export function createResilientChatAdapter(
  provider: LLMProvider,
  options: ResilientChatAdapterOptions = {},
): ResilientChatAdapter {
  const { chatOptions, ...resilience } = options;
  return {
    async chat(messages, callOptions) {
      const merged: ChatOptions & ResilienceOptions = {
        ...chatOptions,
        ...(callOptions?.tools !== undefined
          ? { tools: callOptions.tools as ChatOptions['tools'] }
          : {}),
        ...resilience,
      };
      const outcome = await callWithResilience(provider, toLlmMessages(messages), merged);
      if (!outcome.ok) {
        log.warn(
          { provider: provider.name, code: outcome.code, kind: outcome.kind, attempts: outcome.attempts, degraded: true },
          `LLM 调用失败（韧性层分类）— ${outcome.code}`,
        );
        throw new LlmResilienceError(outcome.code, outcome.message, outcome.retryable, outcome.attempts);
      }
      return toAdapterResult(outcome.result);
    },
  };
}
