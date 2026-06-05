/**
 * providers/gateway.ts — OpenClaw Gateway Provider 适配器
 *
 * 使用 BaseLLMProvider 消除 54 行 SSE/HTTP/健康检查重复代码。
 */
import type { LLMProvider, ProviderConfig } from './types';
import { createOpenAICompatibleProvider } from './base';

export function createGatewayProvider(config: ProviderConfig): LLMProvider {
  const gatewayHost = config.gatewayHost || 'http://127.0.0.1:18789';
  const model = config.model || 'openclaw';

  return createOpenAICompatibleProvider({
    name: 'gateway',
    baseUrl: gatewayHost,
    model,
    chatPath: '/v1/chat/completions',
    modelsPath: '/v1/models',
    healthTimeoutMs: 5000,
    getHeaders: () => ({}), // Gateway 无需认证
  });
}
