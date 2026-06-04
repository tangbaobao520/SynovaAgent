/**
 * config.ts — SynovaAgent 配置 (环境变量读取 + 校验)
 *
 * 最小必需: DEV_MODE=true 或 (LLM_API_KEY + ENGINE_API_TOKENS)
 * 所有值都有合理默认值，适合本地开发和客户部署。
 */
import { createLogger } from './logger';

const log = createLogger('config');

export interface SynovaConfig {
  port: number;
  devMode: boolean;
  dbPath: string;
  llmApiKey: string;
  llmBaseUrl: string;
  llmModel: string;
  engineTokens: string;
  gatewayHost: string;
  llmConfigured: boolean;
}

export function loadConfig(): SynovaConfig {
  const devMode = process.env.DEV_MODE === 'true';

  // LLM 配置 — 多 Provider 支持
  // 通用: LLM_API_KEY (最高优先级) → Provider 专属 env → ''
  const llmApiKey = process.env.LLM_API_KEY
    || process.env.DEEPSEEK_API_KEY
    || process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY
    || process.env.GLM_API_KEY || process.env.ZHIPU_API_KEY
    || process.env.MOONSHOT_API_KEY || process.env.KIMI_API_KEY
    || process.env.YI_API_KEY || process.env.LINGYI_API_KEY
    || process.env.MINIMAX_API_KEY
    || process.env.STEP_API_KEY
    || process.env.ERNIE_API_KEY
    || process.env.OPENAI_API_KEY
    || '';
  const llmBaseUrl = process.env.LLM_BASE_URL || process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';
  const llmModel = process.env.LLM_MODEL || 'deepseek-v4-flash';
  const gatewayHost = process.env.OPENCLAW_GATEWAY_HOST || '';
  const engineTokens = process.env.ENGINE_API_TOKENS || (devMode ? 'synova-dev-token' : '');

  // 数据库路径
  const dataDir = process.env.SYNOVA_DATA_DIR || process.env.CLAWORG_DATA_DIR || '';
  const dbPath = process.env.SYNOVA_DB_PATH ||
    (dataDir ? `${dataDir}/synova.db` : './data/synova.db');

  const port = parseInt(process.env.PORT || '3000', 10);

  if (!devMode && !llmApiKey && !gatewayHost) {
    log.warn('⚠️  未设置 LLM_API_KEY 且未设置 OPENCLAW_GATEWAY_HOST');
    log.warn('   诊断功能将不可用。设置 LLM_API_KEY 或 OPENCLAW_GATEWAY_HOST 后重启。');
  }

  const llmConfigured = !!(llmApiKey || gatewayHost);

  log.info({ port, devMode, dbPath, model: llmModel, llmConfigured }, '配置加载完成');

  return { port, devMode, dbPath, llmApiKey, llmBaseUrl, llmModel, engineTokens, gatewayHost, llmConfigured };
}
