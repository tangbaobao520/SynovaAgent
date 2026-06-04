/**
 * providers/index.ts — Provider 工厂 + 注册中心
 *
 * createProvider(type, config) → LLMProvider
 * listProviderTypes() → ['deepseek', 'qwen', 'glm', 'kimi', 'yi', 'minimax', 'step', 'ernie', 'openai', 'gateway']
 *
 * 所有国产模型 (除文心一言) 均为 OpenAI 兼容 API — 复用 createOpenAIProvider。
 * 文心一言使用 OAuth2 access_token 非 Bearer token — 独立 createErnieProvider。
 */
export { createDeepSeekProvider } from './deepseek';
export { createOpenAIProvider } from './openai';
export { createGatewayProvider } from './gateway';
export { createErnieProvider } from './ernie';
export type { LLMProvider, LLMMessage, ChatOptions, ChatResult, StreamCallback, HealthCheckResult, ProviderConfig } from './types';

import { createDeepSeekProvider } from './deepseek';
import { createOpenAIProvider } from './openai';
import { createGatewayProvider } from './gateway';
import { createErnieProvider } from './ernie';
import type { LLMProvider, ProviderConfig } from './types';

export type ProviderType = 'deepseek' | 'qwen' | 'glm' | 'kimi' | 'yi' | 'minimax' | 'step' | 'ernie' | 'openai' | 'gateway';

const PROVIDER_DEFAULTS: Record<ProviderType, { baseUrl: string; model: string }> = {
  deepseek: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-v4-flash' },
  qwen:    { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  glm:     { baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-plus' },
  kimi:    { baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  yi:      { baseUrl: 'https://api.lingyiwanwu.com/v1', model: 'yi-lightning' },
  minimax: { baseUrl: 'https://api.minimax.chat/v1', model: 'minimax-text-01' },
  step:    { baseUrl: 'https://api.stepfun.com/v1', model: 'step-1-8k' },
  ernie:   { baseUrl: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat', model: 'ernie-4.0-8k' },
  openai:  { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o' },
  gateway: { baseUrl: 'http://127.0.0.1:18789', model: '' },
};

const PROVIDER_LABELS: Record<ProviderType, string> = {
  deepseek: 'DeepSeek V4 (默认, 国内低延迟, 1M 上下文)',
  qwen:     '通义千问 Qwen (阿里云)',
  glm:      '智谱 GLM (清华大学)',
  kimi:     'Kimi Moonshot (月之暗面)',
  yi:       '零一万物 Yi',
  minimax:  'MiniMax',
  step:     '阶跃星辰 Step',
  ernie:    '文心一言 ERNIE (百度)',
  openai:   'OpenAI / 海外通用 (GPT-4o)',
  gateway:  '自定义 Gateway',
};

export function listProviderTypes(): Array<{ type: ProviderType; label: string }> {
  return Object.entries(PROVIDER_LABELS).map(([type, label]) => ({ type: type as ProviderType, label }));
}

export function createProvider(type: ProviderType, config: ProviderConfig): LLMProvider {
  const defaults = PROVIDER_DEFAULTS[type];
  if (!defaults) throw new Error(`不支持的 Provider: ${type}。可用: ${Object.keys(PROVIDER_DEFAULTS).join(', ')}`);
  const cfg = {
    ...config,
    baseUrl: config.baseUrl || defaults.baseUrl,
    model: config.model || defaults.model,
  };

  switch (type) {
    case 'deepseek': return createDeepSeekProvider(cfg);
    case 'ernie':    return createErnieProvider(cfg);
    // All OpenAI-compatible providers
    case 'qwen':
    case 'glm':
    case 'kimi':
    case 'yi':
    case 'minimax':
    case 'step':
    case 'openai':
      return createOpenAIProvider(cfg);
    case 'gateway':  return createGatewayProvider(cfg);
    default: throw new Error(`不支持的 Provider: ${type}`);
  }
}
