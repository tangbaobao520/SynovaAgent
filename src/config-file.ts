/**
 * config-file.ts — 配置文件加载器 (Era C5)
 *
 * 从 synova.json 加载配置, 失败时降级到环境变量。
 * 加载顺序: synova.json > synova.json.last-good (如果主文件损坏) > 环境变量
 *
 * 对标: OpenClaw openclaw.json + openclaw.json.last-good
 *
 * 铁律 39: L5 存储层 — 文件 I/O 操作。
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync, renameSync } from 'fs';
import { join } from 'path';
import { createLogger } from '@synova/logger';

const log = createLogger('services/config-file');

// ═══ Types ═══

export interface SynovaFileConfig {
  version: number;
  server: { port: number };
  llm: { provider: string; model: string; baseUrl: string };
  database: { path: string };
  diagnosis: {
    maxExpertConcurrency: number;
    maxToolRounds: number;
    toolTimeoutMs: number;
  };
  context: {
    compressionStrategy: 'sliding-window' | 'summary' | 'selective';
    maxMessagesBeforeCompression: number;
    windowSize: number;
  };
  sentinel?: {
    baselineMinRuns: number;
    findingCountRatioWarning: number;
    findingCountRatioCritical: number;
    perSentinel?: Record<string, { warningRatio?: number; criticalRatio?: number; minRuns?: number }>;
  };
  devMode: boolean;
}

const DEFAULT_CONFIG_PATH = () => join(process.cwd(), 'synova.json');
const LAST_GOOD_PATH = () => DEFAULT_CONFIG_PATH() + '.last-good';

// ═══ Default Config Template ═══

export const DEFAULT_CONFIG: SynovaFileConfig = {
  version: 1,
  server: { port: 18790 },
  llm: {
    provider: 'deepseek',
    model: 'deepseek-chat',
    baseUrl: 'https://api.deepseek.com/v1',
  },
  database: { path: './data/synova.db' },
  diagnosis: {
    maxExpertConcurrency: 6,
    maxToolRounds: 3,
    toolTimeoutMs: 60000,
  },
  context: {
    compressionStrategy: 'sliding-window',
    maxMessagesBeforeCompression: 30,
    windowSize: 20,
  },
  sentinel: {
    baselineMinRuns: 3,
    findingCountRatioWarning: 2.0,
    findingCountRatioCritical: 3.0,
    perSentinel: {},
  },
  devMode: false,
};

// ═══ Public API ═══

/**
 * 加载 synova.json, 失败则降级到环境变量。
 * 加载顺序: synova.json > synova.json.last-good (如果主文件损坏) > 默认值
 */
export function loadFileConfig(configPath?: string): SynovaFileConfig {
  const path = configPath || DEFAULT_CONFIG_PATH();
  const lastGoodPath = configPath ? configPath + '.last-good' : LAST_GOOD_PATH();

  // 尝试加载主配置文件
  try {
    if (existsSync(path)) {
      const raw = readFileSync(path, 'utf-8');
      const parsed = JSON.parse(raw);
      const errors = validateConfig(parsed);
      if (errors.length === 0) {
        log.info({ path }, '配置文件加载成功');
        return parsed as SynovaFileConfig;
      }
      log.warn({ errors, path }, '配置文件校验失败, 尝试 last-good');
    }
  } catch (err: unknown) {
    log.warn({ err, path }, '配置文件加载失败, 尝试 last-good');
  }

  // 尝试加载 last-good 回滚文件
  try {
    if (existsSync(lastGoodPath)) {
      const raw = readFileSync(lastGoodPath, 'utf-8');
      const parsed = JSON.parse(raw);
      const errors = validateConfig(parsed);
      if (errors.length === 0) {
        log.warn({ path: lastGoodPath }, '使用 last-good 配置 (自动回滚)');
        // 自动恢复: last-good → synova.json
        try {
          copyFileSync(lastGoodPath, path);
          log.info({ path }, '已从 last-good 恢复配置文件');
        } catch (err) {
          log.warn({ err: err instanceof Error ? err.message : String(err) }, "自动恢复: last-good → synova.json");
          /* 非阻断 */
        }
        return parsed as SynovaFileConfig;
      }
    }
  } catch { /* last-good 也不可用, 使用默认值 */ }

  log.warn('所有配置文件不可用, 使用默认配置 + 环境变量');
  return { ...DEFAULT_CONFIG };
}

/**
 * 保存当前配置到 synova.json。
 * 保存前自动备份: synova.json → synova.json.last-good
 */
export function saveFileConfig(config: SynovaFileConfig, configPath?: string): void {
  const path = configPath || DEFAULT_CONFIG_PATH();
  const lastGoodPath = configPath ? configPath + '.last-good' : LAST_GOOD_PATH();

  // 先备份现有文件
  if (existsSync(path)) {
    try {
      copyFileSync(path, lastGoodPath);
      log.debug({ from: path, to: lastGoodPath }, '配置文件已备份');
    } catch (err: unknown) {
      log.warn({ err }, '配置文件备份失败 — 继续保存');
    }
  }

  // 写入新配置
  try {
    writeFileSync(path, JSON.stringify(config, null, 2), 'utf-8');
    log.info({ path }, '配置文件已保存');
  } catch (err: unknown) {
    log.error({ err, path }, '配置文件保存失败');
    throw err;
  }
}

/**
 * 回滚到上一次正常配置。
 * synova.json.last-good → synova.json
 */
export function rollbackConfig(configPath?: string): SynovaFileConfig {
  const path = configPath || DEFAULT_CONFIG_PATH();
  const lastGoodPath = configPath ? configPath + '.last-good' : LAST_GOOD_PATH();

  if (!existsSync(lastGoodPath)) {
    throw new Error(`没有可回滚的 last-good 配置 (${lastGoodPath} 不存在)`);
  }

  try {
    const raw = readFileSync(lastGoodPath, 'utf-8');
    const parsed = JSON.parse(raw);
    const errors = validateConfig(parsed);
    if (errors.length > 0) {
      throw new Error(`last-good 配置校验失败: ${errors.join(', ')}`);
    }
    copyFileSync(lastGoodPath, path);
    log.warn({ from: lastGoodPath, to: path }, '配置已回滚到 last-good');
    return parsed as SynovaFileConfig;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, '配置回滚失败');
    throw new Error(`配置回滚失败: ${msg}`);
  }
}

/**
 * 验证配置文件结构和值范围。
 * 返回错误列表, 空数组 = 有效。
 */
export function validateConfig(config: unknown): string[] {
  const errors: string[] = [];

  if (!config || typeof config !== 'object') {
    errors.push('配置必须是一个对象');
    return errors;
  }

  const c = config as Record<string, unknown>;

  // version
  if (typeof c.version !== 'number' || c.version < 1) {
    errors.push('version 必须为 >= 1 的数字');
  }

  // server
  if (c.server && typeof c.server === 'object') {
    const s = c.server as Record<string, unknown>;
    if (s.port !== undefined && (typeof s.port !== 'number' || s.port < 1 || s.port > 65535)) {
      errors.push('server.port 必须在 1-65535 之间');
    }
  }

  // llm
  if (c.llm && typeof c.llm === 'object') {
    const l = c.llm as Record<string, unknown>;
    if (l.provider && typeof l.provider !== 'string') errors.push('llm.provider 必须为字符串');
    if (l.model && typeof l.model !== 'string') errors.push('llm.model 必须为字符串');
  }

  // diagnosis
  if (c.diagnosis && typeof c.diagnosis === 'object') {
    const d = c.diagnosis as Record<string, unknown>;
    if (d.maxToolRounds !== undefined && (typeof d.maxToolRounds !== 'number' || d.maxToolRounds < 1)) {
      errors.push('diagnosis.maxToolRounds 必须 >= 1');
    }
    if (d.toolTimeoutMs !== undefined && (typeof d.toolTimeoutMs !== 'number' || d.toolTimeoutMs < 1000)) {
      errors.push('diagnosis.toolTimeoutMs 必须 >= 1000');
    }
  }

  // context
  if (c.context && typeof c.context === 'object') {
    const ctx = c.context as Record<string, unknown>;
    const validStrategies = ['sliding-window', 'summary', 'selective'];
    if (ctx.compressionStrategy && !validStrategies.includes(ctx.compressionStrategy as string)) {
      errors.push(`context.compressionStrategy 必须为 ${validStrategies.join('/')}`);
    }
  }

  return errors;
}
