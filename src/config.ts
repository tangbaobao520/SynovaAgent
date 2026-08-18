/**
 * config.ts — SynovaAgent 配置 (环境变量读取 + 校验)
 *
 * 最小必需: DEV_MODE=true 或 (LLM_API_KEY + ENGINE_TOKENS)
 * 所有值都有合理默认值，适合本地开发和客户部署。
 */
import { createLogger } from '@synova/logger';
import { loadFileConfig } from './config-file';
import { ConfigRecovery } from './services/config-recovery';

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
  diagnosis?: {
    maxToolRounds?: number;
    gateDataCompleteness?: number;
    gateMinHypothesisConfidence?: number;
  };
  sentinel?: {
    baselineMinRuns: number;
    findingCountRatioWarning: number;
    findingCountRatioCritical: number;
    perSentinel?: Record<string, { warningRatio?: number; criticalRatio?: number; minRuns?: number }>;
  };
}

export function loadConfig(): SynovaConfig {
  // C5: 优先加载 synova.json, 失败降级到环境变量
  let filePort: number | undefined;
  let fileSentinel: SynovaConfig['sentinel'] | undefined;
  try {
    const fileCfg = loadFileConfig();
    filePort = fileCfg.server.port;
    fileSentinel = fileCfg.sentinel;
    log.info({ port: filePort, source: 'synova.json' }, '使用文件配置');

    // Phase 4.2: 验证配置文件完整性
    try {
      const synovaJsonPath = require('path').join(process.cwd(), 'synova.json');
      const recoveryResult = ConfigRecovery.verify(synovaJsonPath);
      if (recoveryResult.restored) {
        log.info('配置文件已从 .bak 恢复 — 重新加载');
        const restoredCfg = loadFileConfig();
        filePort = restoredCfg.server.port;
        fileSentinel = restoredCfg.sentinel;
      } else if (recoveryResult.corrupted) {
        log.warn({ error: recoveryResult.error }, '配置文件损坏且无法恢复 — 使用默认值');
      }
    } catch (verifyErr: unknown) {
      log.warn({ err: verifyErr }, '配置校验失败 — degraded');
    }
  } catch {
    log.debug('synova.json 不可用, 使用环境变量');
  }

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
  const engineTokens = process.env.ENGINE_TOKENS || (devMode ? 'synova-dev-token' : '');

  // 数据库路径
  const dataDir = process.env.SYNOVA_DATA_DIR || '';
  const dbPath = process.env.SYNOVA_DB_PATH ||
    (dataDir ? `${dataDir}/synova.db` : './data/synova.db');

  const port = parseInt(process.env.PORT || String(filePort || 3000), 10);

  if (!devMode && !llmApiKey && !gatewayHost) {
    log.warn('⚠️  未设置 LLM_API_KEY 且未设置 OPENCLAW_GATEWAY_HOST');
    log.warn('   诊断功能将不可用。设置 LLM_API_KEY 或 OPENCLAW_GATEWAY_HOST 后重启。');
  }

  const llmConfigured = !!(llmApiKey || gatewayHost);

  log.info({ port, devMode, dbPath, model: llmModel, llmConfigured }, '配置加载完成');

  return { port, devMode, dbPath, llmApiKey, llmBaseUrl, llmModel, engineTokens, gatewayHost, llmConfigured, sentinel: fileSentinel };
}
