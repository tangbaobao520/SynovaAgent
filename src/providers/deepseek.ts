/**
 * providers/deepseek.ts — DeepSeek Provider 适配器
 */
import type { LLMProvider, LLMMessage, ChatOptions, ChatResult, StreamCallback, HealthCheckResult, ProviderConfig, ChatCompletionResponse } from './types';
import { DiagnosticAgentError, ErrorCode, isRetryable } from '../errors/types';
import { sanitizeMessages } from './message-sanitizer';

const DEFAULT_BASE_URL = 'https://api.deepseek.com/v1';
const DEFAULT_MODEL = 'deepseek-v4-flash';

export function createDeepSeekProvider(config: ProviderConfig): LLMProvider {
  const baseUrl = config.baseUrl || DEFAULT_BASE_URL;
  const apiKey = config.apiKey || '';
  const model = config.model || DEFAULT_MODEL;

  return {
    name: 'deepseek',
    baseUrl,

    async chat(messages: LLMMessage[], opts?: ChatOptions): Promise<ChatResult> {
      if (!apiKey) throw new DiagnosticAgentError({ code: ErrorCode.AUTH_FAILED, message: 'DeepSeek API Key 未配置', phase: 0, retryable: false });
      // P2-5.4: 消息清洗 — 修复 UTF-16 代理项/控制字符/全角/过长
      const cleaned = sanitizeMessages(messages);
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: opts?.model || model,
          messages: cleaned,
          temperature: opts?.temperature ?? 0.7,
          max_tokens: opts?.maxTokens ?? 4000,
        }),
        signal: opts?.signal ?? AbortSignal.timeout(120_000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const code = res.status === 429 ? ErrorCode.RATE_LIMITED : res.status >= 500 ? ErrorCode.NETWORK : ErrorCode.INTERNAL;
        throw new DiagnosticAgentError({ code, message: `DeepSeek API ${res.status}: ${text.slice(0, 200)}`, phase: 0, retryable: isRetryable(code) });
      }
      const data = await res.json() as ChatCompletionResponse;
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error('DeepSeek 返回缺少 content');
      return {
        content,
        model: data.model || model,
        usage: data.usage ? { promptTokens: data.usage.prompt_tokens, completionTokens: data.usage.completion_tokens } : undefined,
      };
    },

    async stream(messages: LLMMessage[], cb: StreamCallback, opts?: ChatOptions): Promise<void> {
      if (!apiKey) { cb.onError?.(new Error('DeepSeek API Key 未配置')); return; }
      const cleaned = sanitizeMessages(messages);
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: opts?.model || model,
          messages: cleaned,
          temperature: opts?.temperature ?? 0.7,
          max_tokens: opts?.maxTokens ?? 4000,
          stream: true,
        }),
        signal: opts?.signal ?? AbortSignal.timeout(120_000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        cb.onError?.(new Error(`DeepSeek 流式错误 (${res.status}): ${text.slice(0, 200)}`));
        return;
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;
            try {
              const chunk = JSON.parse(data);
              const token = chunk?.choices?.[0]?.delta?.content;
              if (token) { fullContent += token; cb.onToken(token); }
            } catch { /* skip malformed chunks */ }
          }
        }
      } finally {
        reader.releaseLock();
      }
      cb.onComplete?.({ content: fullContent, model });
    },

    async healthCheck(): Promise<HealthCheckResult> {
      if (!apiKey) return { healthy: false, error: 'API Key 未配置。请设置 $env:LLM_API_KEY="sk-your-key"' };
      const start = Date.now();
      try {
        const res = await fetch(`${baseUrl}/models`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(10_000),
        });
        const latency = Date.now() - start;
        if (res.ok) return { healthy: true, latencyMs: latency };
        if (res.status === 401) return { healthy: false, error: 'API Key 无效 (401)，请检查 Key 是否正确', latencyMs: latency };
        return { healthy: false, error: `API 返回 ${res.status}`, latencyMs: latency };
      } catch (err: any) {
        return { healthy: false, error: `连接失败: ${err.message}`, latencyMs: Date.now() - start };
      }
    },

    // Hermes #12: ProviderTransport 适配器

    validateResponse(raw: unknown): { valid: boolean; error?: string } {
      if (!raw || typeof raw !== 'object') return { valid: false, error: '响应体为空或非 JSON' };
      const r = raw as Record<string, unknown>;
      const choices = r.choices;
      if (!Array.isArray(choices) || choices.length === 0) {
        return { valid: false, error: '响应缺少 choices 数组' };
      }
      const msg = (choices[0] as Record<string, unknown>)?.message;
      if (!msg || typeof msg !== 'object') {
        return { valid: false, error: 'choices[0].message 缺失' };
      }
      const content = (msg as Record<string, unknown>).content;
      if (content === undefined || content === null || content === '') {
        // 允许空 content (工具调用模式)
        const toolCalls = (msg as Record<string, unknown>).tool_calls;
        if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
          return { valid: false, error: 'content 和 tool_calls 均为空' };
        }
      }
      return { valid: true };
    },

    convertTools(tools: Array<{ name: string; description: string; parameters: Record<string, unknown> }>): Array<unknown> {
      return tools.map(t => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: {
            ...t.parameters,
            additionalProperties: false, // DeepSeek V4 Strict Mode
          },
          strict: true,
        },
      }));
    },

    listModels(): string[] {
      return [model, 'deepseek-v4-pro', 'deepseek-v4-flash', 'deepseek-v4-r1'];
    },
  };
}
