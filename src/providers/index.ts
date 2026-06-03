/**
 * providers/index.ts — Provider 工厂 + 注册中心
 *
 * createProvider(type, config) → LLMProvider
 * listProviderTypes() → ['deepseek', 'openai', 'gateway']
 */
export { createDeepSeekProvider } from './deepseek';
export { createOpenAIProvider } from './openai';
export { createGatewayProvider } from './gateway';
export type { LLMProvider, LLMMessage, ChatOptions, ChatResult, StreamCallback, HealthCheckResult, ProviderConfig } from './types';

import { createDeepSeekProvider } from './deepseek';
import { createOpenAIProvider } from './openai';
import { createGatewayProvider } from './gateway';
import type { LLMProvider, ProviderConfig } from './types';

export type ProviderType = 'deepseek' | 'openai' | 'gateway';

const PROVIDER_LABELS: Record<ProviderType, string> = {
  deepseek: 'DeepSeek (默认推荐, 国内低延迟)',
  openai: 'OpenAI 兼容 (通义千问/智谱GLM/Kimi/文心一言/零一万物/MiniMax 等)',
  gateway: '自定义 Gateway (高级, 非必要不使用)',
};

export function listProviderTypes(): Array<{ type: ProviderType; label: string }> {
  return Object.entries(PROVIDER_LABELS).map(([type, label]) => ({ type: type as ProviderType, label }));
}

export function createProvider(type: ProviderType, config: ProviderConfig): LLMProvider {
  switch (type) {
    case 'deepseek': return createDeepSeekProvider(config);
    case 'openai':   return createOpenAIProvider(config);
    case 'gateway':  return createGatewayProvider(config);
    default: throw new Error(`不支持的 Provider 类型: ${type}。可用: deepseek, openai, gateway`);
  }
}
