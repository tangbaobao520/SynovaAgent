/**
 * providers/types.ts — LLMProvider 抽象接口 (Era 1.1)
 *
 * 对标 Hermes agent/transports/: 每个 provider 实现统一接口。
 * 调用方不关心底层是 DeepSeek/OpenAI/Gateway——只需 chat()/stream()。
 */

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  /** LLM-requested tool calls (set on assistant messages when tools are invoked) */
  tool_calls?: ToolCall[];
  /** Name of the called function (set on tool result messages) */
  name?: string;
}

export interface ToolCall {
  function: { name: string; arguments: string };
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  tools?: Array<{ type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }>;
}

export interface ChatResult {
  content: string;
  model: string;
  toolCalls?: ToolCall[];
  usage?: { promptTokens: number; completionTokens: number };
}

export interface StreamCallback {
  onToken(token: string): void;
  onComplete?(result: ChatResult): void;
  onError?(err: Error): void;
}

export interface HealthCheckResult {
  healthy: boolean;
  latencyMs?: number;
  error?: string;
}

export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  gatewayHost?: string;
  model?: string;
}

// ═══ API Response Types (P1-02: 消除 as any) ═══

export interface ChatCompletionResponse {
  choices: Array<{
    message: { content: string; role: string; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> };
    finish_reason?: string;
  }>;
  model: string;
  usage?: { prompt_tokens: number; completion_tokens: number };
}

export interface LLMProvider {
  readonly name: string;
  readonly baseUrl: string;

  /** 同步调用 */
  chat(messages: LLMMessage[], options?: ChatOptions): Promise<ChatResult>;

  /** 流式调用 */
  stream(messages: LLMMessage[], callback: StreamCallback, options?: ChatOptions): Promise<void>;

  /** 健康检查（验证 API Key 和连接） */
  healthCheck(): Promise<HealthCheckResult>;

  /** 列出可用模型 */
  listModels(): string[];
}
