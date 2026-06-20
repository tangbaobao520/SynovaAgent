/**
 * agent/expert-config-loader.ts — 专家配置加载器 (v3.3 F2)
 *
 * 从 expert/expert-registry.yaml 读取声明式专家配置。
 * 启动时调用，决定哪些专家参与诊断、哪些是后台引擎。
 *
 * 从文件加载 → 注册到 ExpertRegistry → ExpertDispatcher 消费。
 * 不需要改任何 .ts 文件来增删专家。
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createLogger } from '../logger';

const log = createLogger('agent/expert-config-loader');

export interface ExpertConfigEntry {
  enabled: boolean;
  background: boolean;
  model: string;
  tools: string[];
}

export interface ExpertRegistryConfig {
  version: number;
  experts: Record<string, ExpertConfigEntry>;
}

const DEFAULT_CONFIG_PATH = join(process.cwd(), 'expert', 'expert-registry.yaml');

/** 简易 YAML 解析器 — 仅解析 expert-registry.yaml 的嵌套结构，不引入外部依赖 */
function parseSimpleYaml(content: string): ExpertRegistryConfig {
  const config: ExpertRegistryConfig = { version: 1, experts: {} };
  let currentExpert = '';
  let inTools = false;

  for (const line of content.split('\n')) {
    if (line.startsWith('version:')) {
      config.version = parseInt(line.split(':')[1]?.trim() || '1', 10);
    } else if (/^  [a-z_]+:$/.test(line) && !line.includes(':')) {
      // Top-level expert key like "  strategy:"
      currentExpert = line.trim().replace(':', '');
      if (currentExpert && currentExpert !== 'experts' && currentExpert !== 'version') {
        config.experts[currentExpert] = { enabled: true, background: false, model: 'default', tools: [] };
      }
      inTools = false;
    } else if (currentExpert && line.includes('enabled:')) {
      config.experts[currentExpert].enabled = line.includes('true');
    } else if (currentExpert && line.includes('background:')) {
      config.experts[currentExpert].background = line.includes('true');
    } else if (currentExpert && line.includes('model:')) {
      config.experts[currentExpert].model = line.split(':')[1]?.trim() || 'default';
    } else if (currentExpert && line.trim() === 'tools:') {
      inTools = true;
    } else if (currentExpert && inTools && line.includes('- ')) {
      const tool = line.split('- ')[1]?.trim();
      if (tool) config.experts[currentExpert].tools.push(tool);
    } else {
      inTools = false;
    }
  }

  return config;
}

let _cachedConfig: ExpertRegistryConfig | null = null;

/** 加载专家配置（带缓存，/api/reload 时清除缓存） */
export function loadExpertConfig(configPath?: string): ExpertRegistryConfig {
  if (_cachedConfig) return _cachedConfig;

  const path = configPath || DEFAULT_CONFIG_PATH;
  if (!existsSync(path)) {
    log.warn({ path }, 'expert-registry.yaml 未找到 — 使用默认配置（所有专家启用）');
    return { version: 1, experts: {} };
  }

  try {
    const content = readFileSync(path, 'utf-8');
    const config = parseSimpleYaml(content);
    log.info({ expertCount: Object.keys(config.experts).length, path },
      '专家配置已从 yaml 加载');
    _cachedConfig = config;
    return config;
  } catch (err: any) {
    log.error({ err: err.message, path }, 'expert-registry.yaml 解析失败');
    return { version: 1, experts: {} };
  }
}

/** 清除配置缓存（POST /api/reload 时调用） */
export function clearExpertConfigCache(): void {
  _cachedConfig = null;
}

/** 从配置获取启用的诊断专家列表（排除 background） */
export function getEnabledDiagnosticExperts(config?: ExpertRegistryConfig): string[] {
  const cfg = config || loadExpertConfig();
  if (!cfg.experts || Object.keys(cfg.experts).length === 0) {
    // 配置为空 → fallback 到文件扫描结果
    return [];
  }
  return Object.entries(cfg.experts)
    .filter(([, entry]) => entry.enabled && !entry.background)
    .map(([name]) => name);
}

/** 从配置获取后台专家列表 */
export function getBackgroundExperts(config?: ExpertRegistryConfig): Set<string> {
  const cfg = config || loadExpertConfig();
  const bg = Object.entries(cfg.experts)
    .filter(([, entry]) => entry.background)
    .map(([name]) => name);
  return new Set(bg);
}
