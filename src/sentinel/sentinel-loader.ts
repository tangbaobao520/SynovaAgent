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
import { pathToFileURL } from 'url';
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
  // V4.2.5: 增长动力学 8 层模型
  layer?: 'environment' | 'capital' | 'interface' | 'alignment' | 'internal' | 'technology';
  auxiliaryExperts?: string[];
  computeKind?: 'deterministic' | 'heuristic' | 'conditional' | 'inferred' | 'aggregate';
  technoEconomicPhaseCalibration?: boolean;
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

// ═══ Registry 注册 ═══

/**
 * 将已加载的文件驱动哨兵注册到全局 SentinelRegistry。
 * 每个哨兵动态 import 其 aggregate.ts，包装为 Sentinel 接口后注册。
 */
export async function registerLoadedSentinels(): Promise<{ registered: number; errors: string[] }> {
  const { sentinels, errors: loadErrors } = loadSentinels();
  const errors = [...loadErrors];
  let registered = 0;

  for (const { manifest, dir } of sentinels) {
    try {
      const entryPath = join(dir, manifest.entryPoint || './aggregate.ts');
      if (!existsSync(entryPath)) {
        errors.push(`哨兵 ${manifest.name} entryPoint 不存在: ${entryPath}`);
        continue;
      }

      const mod = await import(pathToFileURL(entryPath).href);
      const sentinelObj = mod[manifest.exportKey || 'default'];
      if (!sentinelObj || typeof sentinelObj.check !== 'function') {
        errors.push(`哨兵 ${manifest.name} 缺少 check() 方法`);
        continue;
      }

      // 动态导入 registry 避免循环依赖
      const { getSentinelRegistry } = await import('./registry');
      const registry = getSentinelRegistry();

      registry.register({
        config: {
          id: `sentinel-${manifest.name}`,
          name: manifest.displayName || manifest.name,
          description: manifest.description || '',
          category: 'growth',
          priority: (manifest.priority as 'P0' | 'P1' | 'P2') || 'P1',
          mode: 'cron',
          cron: manifest.schedule || '0 */6 * * *',
          version: manifest.version || '1.0.0',
          requiredDataSources: manifest.context?.requiredDataSources || [],
          layer: manifest.layer,
          auxiliaryExperts: manifest.auxiliaryExperts,
          computeKind: manifest.computeKind,
          technoEconomicPhaseCalibration: manifest.technoEconomicPhaseCalibration,
        },
        async check(context) {
          // 将 SentinelContext.db 作为 GraphStore 传给 aggregate
          const raw = await sentinelObj.check(
            context.db as Record<string, unknown>,
            (context as Record<string, unknown>).teamId || 'default',
          );
          // 兼容两种返回格式: SentinelFinding[] 或 { findings: SentinelFinding[] }
          const findings: SentinelFinding[] = Array.isArray(raw) ? raw : (raw?.findings || []);
          return { sentinelId: `sentinel-${manifest.name}`, ok: true, findings, durationMs: 0 };
        },
      });

      registered++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`哨兵 ${manifest.name} 注册失败: ${msg}`);
    }
  }

  if (registered > 0) log.info({ registered, errors: errors.length }, '文件驱动哨兵已注册');
  return { registered, errors };
}
