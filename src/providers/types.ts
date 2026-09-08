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
  /** DeepSeek reasoning_effort: 'off' | 'high' | 'max' */
  reasoningEffort?: string;
  signal?: AbortSignal;
  tools?: Array<{ type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown>; strict?: boolean } }>;
  /** Hermes P5: Prefix Cache 配置 (DeepSeek 自动缓存 — 保留用于 Anthropic 等显式断点) */
  cacheConfig?: {
    enabled: boolean;
    breakpoints: ('system' | 'messages' | 'tools')[];
  };
}

export interface ChatResult {
  content: string;
  model: string;
  toolCalls?: ToolCall[];
  /**
   * D598: usage 增可选 cache 桶（四桶 disjoint 计量 seam）。
   * promptTokens 语义保持不变 = 总 prompt（含 cache 命中，DeepSeek 口径）；
   * cacheReadTokens/cacheWriteTokens 缺省 = provider 未上报，消费方按 0 处理。
   */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
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

// ═══ API Response Types (P1-02: 消除 `as-any`) ═══

export interface ChatCompletionResponse {
  choices: Array<{
    message: { content: string; role: string; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> };
    finish_reason?: string;
  }>;
  model: string;
  /**
   * D598: 补充 DeepSeek cache 字段（DSH llm-deepseek translate.js mapUsage 同源口径）:
   * prompt_tokens 含 cache 命中（prompt_tokens = prompt_cache_hit_tokens + miss），
   * 四桶 disjoint 计量须拆出 cacheRead。
   */
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    prompt_tokens_details?: { cached_tokens?: number };
    prompt_cache_hit_tokens?: number;
  };
}

export interface LLMProvider {
  readonly name: string;
  readonly baseUrl: string;

  /** 同步调用 */
  chat(messages: LLMMessage[], options?: ChatOptions): Promise<ChatResult>;

  /** 流式调用 */
  stream(messages: LLMMessage[], callback: StreamCallback, options?: ChatOptions): Promise<void>;

  /** Hermes #12: 校验 LLM 返回的原始响应 */
  validateResponse?(raw: unknown): { valid: boolean; error?: string };

  /** Hermes #12: 将内部 ToolDefinition 转换为 Provider 原生格式 */
  convertTools?(tools: Array<{ name: string; description: string; parameters: Record<string, unknown> }>): Array<unknown>;

  /** 健康检查（验证 API Key 和连接） */
  healthCheck(): Promise<HealthCheckResult>;

  /** 列出可用模型 */
  listModels(): string[];
}
