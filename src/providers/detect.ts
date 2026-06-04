/**
 * providers/detect.ts — 统一 Provider 检测 (铁律 #23 传播检查)
 *
 * 按环境变量自动检测应使用的 LLM Provider。
 * 优先顺序: Gateway > 国产模型(按检测顺序) > OpenAI > DeepSeek (默认)
 */
import type { ProviderType } from './index';

export function detectProvider(): ProviderType {
  if (process.env.OPENCLAW_GATEWAY_HOST) return 'gateway';

  // 国产模型 — 按环境变量检测
  if (process.env.ERNIE_API_KEY || process.env.ERNIE_SECRET_KEY) return 'ernie';
  if (process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY) return 'qwen';
  if (process.env.GLM_API_KEY || process.env.ZHIPU_API_KEY) return 'glm';
  if (process.env.MOONSHOT_API_KEY || process.env.KIMI_API_KEY) return 'kimi';
  if (process.env.YI_API_KEY || process.env.LINGYI_API_KEY) return 'yi';
  if (process.env.MINIMAX_API_KEY) return 'minimax';
  if (process.env.STEP_API_KEY) return 'step';

  // 通用
  if (process.env.LLM_BASE_URL?.includes('openai.com')) return 'openai';
  if (process.env.OPENAI_API_KEY) return 'openai';

  // 默认: DeepSeek (通过 LLM_API_KEY 或 DEEPSEEK_API_KEY)
  return 'deepseek';
}
