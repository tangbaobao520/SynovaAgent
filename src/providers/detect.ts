/**
 * providers/detect.ts — 统一 Provider 检测 (Slice 2.3, 铁律 #23 传播检查)
 *
 * 之前 detectProvider() 在三处重复 (chat.ts, cli.ts, mcp/index.ts)。
 * 统一为单一源，一处修改，全部生效。
 */
import type { ProviderType } from './index';

/**
 * 根据环境变量检测应使用的 LLM Provider 类型。
 *
 * 优先顺序: Gateway > OpenAI > DeepSeek (默认)
 */
export function detectProvider(): ProviderType {
  if (process.env.OPENCLAW_GATEWAY_HOST) return 'gateway';
  if (process.env.LLM_BASE_URL?.includes('openai.com')) return 'openai';
  return 'deepseek';
}
