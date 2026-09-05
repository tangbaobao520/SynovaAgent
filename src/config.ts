/**
 * config.ts — SynovaAgent 配置 (环境变量读取 + 校验)
 *
 * 最小必需: DEV_MODE=true 或 (LLM_API_KEY + ENGINE_TOKENS)
 * 所有值都有合理默认值，适合本地开发和客户部署。
 */
import { createLogger } from '@synova/logger';
import { loadFileConfig } from './config-file';
import { ConfigRecovery } from './services/config-recovery';
import { resolveLlmApiKey, getStoredLlmRuntime } from './services/llm-credential-store';
import { join } from 'path';

const log = createLogger('config');

export interface SynovaConfig {
  port: number;
  devMode: boolean;
  dbPath: string;
  /** 实例级组织身份（P0-7 物理隔离语义）— SYNOVA_ORG_ID，默认 'default' */
  orgId: string;
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
  // D575: fileCfg 提升到 try 外（spec §3.3.1）——llm 段作为 model/baseUrl 的只读回退（消死配置）
  let fileCfg: ReturnType<typeof loadFileConfig> | undefined;
  let filePort: number | undefined;
  let fileSentinel: SynovaConfig['sentinel'] | undefined;
  try {
    fileCfg = loadFileConfig();
    filePort = fileCfg.server.port;
    fileSentinel = fileCfg.sentinel;
    log.info({ port: filePort, source: 'synova.json' }, '使用文件配置');

    // Phase 4.2: 验证配置文件完整性
    try {
      const synovaJsonPath = join(process.cwd(), 'synova.json');
      const recoveryResult = ConfigRecovery.verify(synovaJsonPath);
      if (recoveryResult.restored) {
        log.info('配置文件已从 .bak 恢复 — 重新加载');
        const restoredCfg = loadFileConfig();
        fileCfg = restoredCfg;
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
  // 通用: D575 分层解析 凭证文件(stored) → 14 级 env 链（原样保留, LLM_API_KEY 最高）→ ''
  // 每请求 loadConfig() 均重读凭证文件 → 保存后下一请求即用新 key（热重载, spec §6 决策 3）
  const llmApiKey = resolveLlmApiKey().value
    || process.env.LLM_API_KEY
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
  // model/baseUrl: getStoredLlmRuntime() → 原 env 链 → synova.json llm 段（只读激活, 消死配置）→ 原默认
  const storedLlmRuntime = getStoredLlmRuntime();
  const llmBaseUrl = storedLlmRuntime?.baseUrl
    || process.env.LLM_BASE_URL || process.env.DEEPSEEK_BASE_URL
    || fileCfg?.llm.baseUrl
    || 'https://api.deepseek.com/v1';
  const llmModel = storedLlmRuntime?.model
    || process.env.LLM_MODEL
    || fileCfg?.llm.model
    || 'deepseek-v4-flash';
  const gatewayHost = process.env.OPENCLAW_GATEWAY_HOST || '';
  const engineTokens = process.env.ENGINE_TOKENS || (devMode ? 'synova-dev-token' : '');

  // 数据库路径
  const dataDir = process.env.SYNOVA_DATA_DIR || '';
  const dbPath = process.env.SYNOVA_DB_PATH ||
    (dataDir ? `${dataDir}/synova.db` : './data/synova.db');

  const port = parseInt(process.env.PORT || String(filePort || 3000), 10);

  // 实例级组织身份 — 多租户逻辑隔离的根来源（D338）。缺省 'default' 即本实例的唯一 org
  const orgId = process.env.SYNOVA_ORG_ID || 'default';

  if (!devMode && !llmApiKey && !gatewayHost) {
    log.warn('⚠️  未设置 LLM_API_KEY 且未设置 OPENCLAW_GATEWAY_HOST');
    log.warn('   诊断功能将不可用。设置 LLM_API_KEY 或 OPENCLAW_GATEWAY_HOST 后重启。');
  }

  const llmConfigured = !!(llmApiKey || gatewayHost);

  log.info({ port, devMode, dbPath, model: llmModel, llmConfigured }, '配置加载完成');

  return { port, devMode, dbPath, orgId, llmApiKey, llmBaseUrl, llmModel, engineTokens, gatewayHost, llmConfigured, sentinel: fileSentinel };
}
