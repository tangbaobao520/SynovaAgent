/**
 * providers/gateway.ts — OpenClaw Gateway Provider 适配器
 */
import type { LLMProvider, LLMMessage, ChatOptions, ChatResult, StreamCallback, HealthCheckResult, ProviderConfig, ChatCompletionResponse } from './types';

export function createGatewayProvider(config: ProviderConfig): LLMProvider {
  const gatewayHost = config.gatewayHost || 'http://127.0.0.1:18789';
  const model = config.model || 'openclaw';

  return {
    name: 'gateway',
    baseUrl: gatewayHost,

    async chat(messages: LLMMessage[], opts?: ChatOptions) {
      const res = await fetch(`${gatewayHost}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: opts?.model || model,
          messages,
          temperature: opts?.temperature ?? 0.7,
          max_tokens: opts?.maxTokens ?? 4000,
        }),
        signal: opts?.signal ?? AbortSignal.timeout(120_000),
      });
      if (!res.ok) { const t = await res.text().catch(() => ''); throw new Error(`Gateway 错误 (${res.status}): ${t.slice(0, 300)}`); }
      const data = await res.json() as ChatCompletionResponse;
      const content = data?.choices?.[0]?.message?.content;
      if (!content) throw new Error('Gateway 返回缺少 content');
      return { content, model: data.model || model };
    },

    async stream(messages, cb, opts) {
      const res = await fetch(`${gatewayHost}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: opts?.model || model, messages,
          temperature: opts?.temperature ?? 0.7,
          max_tokens: opts?.maxTokens ?? 4000,
          stream: true,
        }),
        signal: opts?.signal ?? AbortSignal.timeout(120_000),
      });
      if (!res.ok) { const t = await res.text().catch(() => ''); cb.onError?.(new Error(`Gateway 流式错误 (${res.status}): ${t.slice(0, 200)}`)); return; }
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
            try { const c = JSON.parse(d); const tok = c?.choices?.[0]?.delta?.content; if (tok) { full += tok; cb.onToken(tok); } } catch { /* SSE chunk parse — benign */ }
          }
        }
      } finally { reader.releaseLock(); }
      cb.onComplete?.({ content: full, model });
    },

    async healthCheck() {
      const start = Date.now();
      try {
        const res = await fetch(`${gatewayHost}/v1/models`, { signal: AbortSignal.timeout(5000) });
        const lat = Date.now() - start;
        return res.ok ? { healthy: true, latencyMs: lat } : { healthy: false, error: `Gateway 不可达 (${res.status})`, latencyMs: lat };
      } catch (err: any) {
        return { healthy: false, error: `Gateway 不可达: ${err.message}`, latencyMs: Date.now() - start };
      }
    },

    listModels() { return [model]; },
  };
}
