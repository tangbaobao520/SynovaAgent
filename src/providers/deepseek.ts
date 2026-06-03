/**
 * providers/deepseek.ts — DeepSeek Provider 适配器
 */
import type { LLMProvider, LLMMessage, ChatOptions, ChatResult, StreamCallback, HealthCheckResult, ProviderConfig, ChatCompletionResponse } from './types';

const DEFAULT_BASE_URL = 'https://api.deepseek.com/v1';
const DEFAULT_MODEL = 'deepseek-chat';

export function createDeepSeekProvider(config: ProviderConfig): LLMProvider {
  const baseUrl = config.baseUrl || DEFAULT_BASE_URL;
  const apiKey = config.apiKey || '';
  const model = config.model || DEFAULT_MODEL;

  return {
    name: 'deepseek',
    baseUrl,

    async chat(messages: LLMMessage[], opts?: ChatOptions): Promise<ChatResult> {
      if (!apiKey) throw new Error('DeepSeek API Key 未配置');
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: opts?.model || model,
          messages,
          temperature: opts?.temperature ?? 0.7,
          max_tokens: opts?.maxTokens ?? 4000,
        }),
        signal: opts?.signal ?? AbortSignal.timeout(120_000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`DeepSeek API 错误 (${res.status}): ${text.slice(0, 300)}`);
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
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: opts?.model || model,
          messages,
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

    listModels(): string[] {
      // P3-03: 当前同步返回已知模型。LLMProvider 接口为同步签名，改为 API /models 需接口升级。
      return [model, 'deepseek-chat', 'deepseek-reasoner'];
    },
  };
}
