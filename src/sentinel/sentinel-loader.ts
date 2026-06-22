/**
 * src/sentinel/sentinel-loader.ts — 哨兵加载器
 *
 * 从 extensions/sentinels/{name}/ 目录加载哨兵定义。
 * 替代 builtins.ts 的硬编码注册。
 *
 * V3.7 Batch 2 — 哨兵子领域重构
 */
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createLogger } from '../logger';

const log = createLogger('sentinel/loader');

export interface SentinelManifest {
  name: string;
  version: string;
  type: string;
  displayName: string;
  description: string;
  schedule: string;
  expert: string;
  priority: string;
  computes: string[];
  thresholds: Record<string, { warning: number; critical: number }>;
  aggregation: 'worst_first' | 'weighted_sum' | 'majority_vote';
  context: {
    requiredDataSources: string[];
    dataAccess: { allowedDimensions: string[]; sensitiveAccess: string };
  };
  entryPoint: string;
  exportKey: string;
}

export interface LoadedSentinel {
  manifest: SentinelManifest;
  dir: string;
}

const SENTINELS_DIR = join(process.cwd(), 'extensions', 'sentinels');

// ═══ Cache ═══
let cache: LoadedSentinel[] | null = null;

/**
 * 扫描 extensions/sentinels/ 目录，加载所有哨兵 manifest。
 */
export function loadSentinels(): { sentinels: LoadedSentinel[]; degraded: boolean; errors: string[] } {
  const errors: string[] = [];

  if (cache) return { sentinels: cache, degraded: false, errors: [] };

  const sentinels: LoadedSentinel[] = [];

  try {
    if (!existsSync(SENTINELS_DIR)) {
      errors.push(`哨兵目录不存在: ${SENTINELS_DIR}`);
      return { sentinels: [], degraded: true, errors };
    }

    const entries = readdirSync(SENTINELS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === 'shared') continue; // 工具库，不是哨兵
      if (entry.name.startsWith('_')) continue; // 模板目录

      const manifestPath = join(SENTINELS_DIR, entry.name, 'manifest.json');
      if (!existsSync(manifestPath)) {
        errors.push(`哨兵 ${entry.name} 缺少 manifest.json`);
        continue;
      }

      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as SentinelManifest;
        sentinels.push({ manifest, dir: join(SENTINELS_DIR, entry.name) });
      } catch (err: any) {
        errors.push(`哨兵 ${entry.name} manifest 解析失败: ${err.message}`);
      }
    }

    log.info({ count: sentinels.length, errors: errors.length }, '哨兵加载完成');
    cache = sentinels;
    return { sentinels, degraded: errors.length > 0, errors };
  } catch (err: any) {
    log.error({ err }, '哨兵加载失败 — degraded');
    errors.push(`哨兵加载失败: ${err.message}`);
    return { sentinels: [], degraded: true, errors };
  }
}

/**
 * 按专家类型筛选哨兵。
 */
export function getSentinelsByExpert(expert: string): LoadedSentinel[] {
  const { sentinels } = loadSentinels();
  return sentinels.filter(s => s.manifest.expert === expert);
}

/**
 * 清除缓存（用于热加载）。
 */
export function clearSentinelCache(): void {
  cache = null;
  log.info('哨兵缓存已清除');
}
