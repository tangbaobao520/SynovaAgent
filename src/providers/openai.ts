/**
 * providers/openai.ts — OpenAI 兼容 Provider 适配器
 *
 * 使用 BaseLLMProvider 消除重复代码。
 */
import type { LLMProvider, ProviderConfig } from './types';
import { createOpenAICompatibleProvider } from './base';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o';

export function createOpenAIProvider(config: ProviderConfig): LLMProvider {
  const baseUrl = config.baseUrl || DEFAULT_BASE_URL;
  const apiKey = config.apiKey || '';
  const model = config.model || DEFAULT_MODEL;

  return createOpenAICompatibleProvider({
    name: 'openai',
    baseUrl,
    model,
    apiKey,
    getHeaders: () => ({ Authorization: `Bearer ${apiKey}` }),
  });
}
