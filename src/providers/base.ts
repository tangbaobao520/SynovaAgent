/**
 * providers/base.ts — LLM Provider 基类 (P3: OpenAI-compatible 模板去重)
 *
 * 封装三个 Provider (deepseek/openai/gateway) 的 82 行重复代码:
 *   - HTTP POST 请求构建 (块 B)
 *   - SSE 流式读取器 (块 A)
 *   - 健康检查 (块 C)
 *   - 非 OK 错误处理 (块 D)
 *
 * 子类只需提供: name, baseUrl, model, apiKey, auth headers, 差异化逻辑。
 */

import type {
  LLMProvider, LLMMessage, ChatOptions, ChatResult,
  StreamCallback, HealthCheckResult, ProviderConfig, ChatCompletionResponse,
} from './types';

// ═══ 子类需实现的配置接口 ═══

export interface ProviderAdapterConfig {
  name: string;
  baseUrl: string;
  model: string;
  /** API Key (gateway 可留空) */
  apiKey?: string;
  /** 额外请求头 (如 Authorization) */
  getHeaders(): Record<string, string>;
  /** Chat endpoint 路径 (默认 /chat/completions) */
  chatPath?: string;
  /** Models endpoint 路径 (默认 /models) */
  modelsPath?: string;
  /** 健康检查超时 ms (默认 10000) */
  healthTimeoutMs?: number;
  /** 流式消息发送前钩子 (如 sanitizeMessages) */
  beforeSend?(messages: LLMMessage[]): LLMMessage[];
  /** 响应后处理钩子 (如丰富 usage 信息) */
  afterResponse?(data: ChatCompletionResponse, opts?: ChatOptions): Partial<ChatResult>;
  /** 错误处理钩子 (如 DiagnosticAgentError 包装) */
  onError?(err: Error, context: string): Error;
}

// ═══ 共享工厂 — 创建完整 LLMProvider ═══

export function createOpenAICompatibleProvider(cfg: ProviderAdapterConfig): LLMProvider {
  const baseUrl = cfg.baseUrl;
  const model = cfg.model;
  const chatPath = cfg.chatPath ?? '/chat/completions';
  const modelsPath = cfg.modelsPath ?? '/models';
  const healthTimeout = cfg.healthTimeoutMs ?? 10_000;

  /** 共享 HTTP POST 请求 — 消除 24 行重复 (块 B) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function makeRequest(messages: LLMMessage[] | LLMMessage[], opts?: ChatOptions, stream = false) {
    if (cfg.apiKey !== undefined && !cfg.apiKey) {
      throw new Error(`${cfg.name} API Key 未配置`);
    }
    const body: Record<string, unknown> = {
      model: opts?.model || model,
      messages: cfg.beforeSend ? cfg.beforeSend(messages) : messages,
      temperature: opts?.temperature ?? 0.7,
      max_tokens: opts?.maxTokens ?? 4000,
    };
    if (opts?.reasoningEffort) body.reasoning_effort = opts.reasoningEffort;
    if (stream) body.stream = true;

    return fetch(`${baseUrl}${chatPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...cfg.getHeaders() },
      body: JSON.stringify(body),
      signal: opts?.signal ?? AbortSignal.timeout(120_000),
    });
  }

  /** 共享非 OK 错误处理 — 消除 12 行重复 (块 D) */
  async function checkResponse(res: Response, context: string): Promise<void> {
    if (res.ok) return;
    const t = await res.text().catch(() => '');
    const err = new Error(`${cfg.name} ${context} (${res.status}): ${t.slice(0, 300)}`);
    throw cfg.onError ? cfg.onError(err, context) : err;
  }

  /** 共享 SSE 流式读取器 — 消除 54 行重复 (块 A) */
  async function handleStream(res: Response, cb: StreamCallback, usedModel: string): Promise<void> {
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = '', full = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n'); buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const d = line.slice(6).trim();
          if (d === '[DONE]') continue;
          try {
            const c = JSON.parse(d);
            const tok = c?.choices?.[0]?.delta?.content;
            if (tok) { full += tok; cb.onToken(tok); }
          } catch { console.debug('SSE chunk parse — benign, high volume'); }
        }
      }
    } finally { reader.releaseLock(); }
    cb.onComplete?.({ content: full, model: usedModel });
  }

  /** 共享健康检查 — 消除 33 行重复 (块 C) */
  async function healthCheck(): Promise<HealthCheckResult> {
    if (cfg.apiKey !== undefined && !cfg.apiKey) {
      return { healthy: false, error: 'API Key 未配置' };
    }
    const start = Date.now();
    try {
      const res = await fetch(`${baseUrl}${modelsPath}`, {
        headers: cfg.getHeaders(),
        signal: AbortSignal.timeout(healthTimeout),
      });
      const lat = Date.now() - start;
      if (res.ok) return { healthy: true, latencyMs: lat };
      return { healthy: false, error: `${cfg.name} 返回 ${res.status}`, latencyMs: lat };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { healthy: false, error: `${cfg.name}: ${msg}`, latencyMs: Date.now() - start };
    }
  }

  return {
    name: cfg.name,
    baseUrl,

    async chat(messages, opts) {
      const msgs = cfg.beforeSend ? cfg.beforeSend(messages) : messages;
      const res = await makeRequest(msgs, opts);
      await checkResponse(res, 'API 错误');
      const data = await res.json() as ChatCompletionResponse;
      const content = data?.choices?.[0]?.message?.content;
      if (!content) throw new Error(`${cfg.name} 返回缺少 content`);
      const extra = cfg.afterResponse ? cfg.afterResponse(data, opts) : {};
      return { content, model: data.model || model, ...extra };
    },

    async stream(messages, cb, opts) {
      try {
        const res = await makeRequest(messages, opts, true);
        if (!res.ok) {
          await checkResponse(res, '流式错误').catch((err: Error) => { cb.onError?.(err); });
          return;
        }
        await handleStream(res, cb, opts?.model || model);
      } catch (err: unknown) {
        const e = err instanceof Error ? err : new Error(String(err));
        cb.onError?.(cfg.onError ? cfg.onError(e, 'stream') : e);
      }
    },

    healthCheck,
    listModels() { return [model]; },
  };
}
