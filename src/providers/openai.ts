/**
 * providers/openai.ts — OpenAI 兼容 Provider 适配器
 *
 * 任何兼容 OpenAI Chat Completions API 的服务都可以用此适配器。
 */
import type { LLMProvider, LLMMessage, ChatOptions, ChatResult, StreamCallback, HealthCheckResult, ProviderConfig } from './types';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o';

export function createOpenAIProvider(config: ProviderConfig): LLMProvider {
  const baseUrl = config.baseUrl || DEFAULT_BASE_URL;
  const apiKey = config.apiKey || '';
  const model = config.model || DEFAULT_MODEL;

  async function makeRequest(messages: LLMMessage[], opts?: ChatOptions, stream = false) {
    if (!apiKey) throw new Error('OpenAI API Key 未配置');
    return fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: opts?.model || model,
        messages,
        temperature: opts?.temperature ?? 0.7,
        max_tokens: opts?.maxTokens ?? 4000,
        stream,
      }),
      signal: opts?.signal ?? AbortSignal.timeout(120_000),
    });
  }

  return {
    name: 'openai',
    baseUrl,

    async chat(messages, opts) {
      const res = await makeRequest(messages, opts);
      if (!res.ok) { const t = await res.text().catch(() => ''); throw new Error(`OpenAI API 错误 (${res.status}): ${t.slice(0, 300)}`); }
      const data = await res.json() as any;
      const content = data?.choices?.[0]?.message?.content;
      if (!content) throw new Error('OpenAI 返回缺少 content');
      return { content, model: data.model || model };
    },

    async stream(messages, cb, opts) {
      if (!apiKey) { cb.onError?.(new Error('OpenAI API Key 未配置')); return; }
      const res = await makeRequest(messages, opts, true);
      if (!res.ok) { const t = await res.text().catch(() => ''); cb.onError?.(new Error(`OpenAI 流式错误 (${res.status}): ${t.slice(0, 200)}`)); return; }
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
            try { const c = JSON.parse(d); const tok = c?.choices?.[0]?.delta?.content; if (tok) { full += tok; cb.onToken(tok); } } catch { /* JSON.parse of chunk — benign, skip malformed line */ }
          }
        }
      } finally { reader.releaseLock(); }
      cb.onComplete?.({ content: full, model });
    },

    async healthCheck() {
      if (!apiKey) return { healthy: false, error: 'API Key 未配置' };
      const start = Date.now();
      try {
        const res = await fetch(`${baseUrl}/models`, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(10_000) });
        const lat = Date.now() - start;
        return res.ok ? { healthy: true, latencyMs: lat } : { healthy: false, error: `API 返回 ${res.status}`, latencyMs: lat };
      } catch (err: any) {
        return { healthy: false, error: `连接失败: ${err.message}`, latencyMs: Date.now() - start };
      }
    },

    listModels() { return [model, 'gpt-4o-mini', 'gpt-4-turbo']; },
  };
}
