/**
 * sentinel/builtins.ts — 内置哨兵自动注册
 *
 * 2026-06-18: 从硬编码 25 个模块 → 目录自动扫描。
 * 加新哨兵 = 在 adapters/ 创建 xxx-sentinel.ts 文件 → 自动注册。
 * 不需要改 builtins.ts。
 *
 * 架构: L2 (synova-agent.ts) → L3 (builtins.ts) → L3 (adapters/*)
 */

import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getSentinelRegistry } from './registry';
import { createLogger } from '../logger';

const log = createLogger('sentinel/builtins');

/**
 * 从文件名推导导出键名。
 * htm-sentinel.ts → htmSentinel
 * revenue-decomposition-sentinel.ts → revenueDecompositionSentinel
 * gap-dynamics-sentinel.ts → gapDynamicsSentinel
 */
function filenameToExportKey(filename: string): string {
  const base = filename.replace(/-sentinel\.ts$/, '').replace(/\.ts$/, '');
  return base.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

/**
 * 扫描 adapters/ 目录，自动发现并注册所有 *-sentinel.ts 文件。
 * 每个模块独立 try/catch——一个加载失败不影响其他。
 */
export async function registerBuiltinSentinels(): Promise<void> {
  const registry = getSentinelRegistry();
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const adaptersDir = join(__dirname, 'adapters');

  let sentinelFiles: string[];
  try {
    sentinelFiles = readdirSync(adaptersDir).filter(f => f.endsWith('-sentinel.ts') || f.endsWith('-sentinel.js'));
  } catch {
    log.error('[builtins] adapters/ 目录不可读 — 哨兵注册失败');
    return;
  }

  if (sentinelFiles.length === 0) {
    log.warn('[builtins] adapters/ 无 *-sentinel 文件 — 零哨兵注册');
    return;
  }

  let registered = 0;

  for (const filename of sentinelFiles) {
    const key = filenameToExportKey(filename);
    try {
      const mod = await import(join(adaptersDir, filename).replace(/\\/g, '/'));
      const sentinel = (mod as Record<string, unknown>)[key];
      if (sentinel && typeof sentinel === 'object' && 'config' in sentinel) {
        registry.register(sentinel as Parameters<typeof registry.register>[0]);
        registered++;
        log.info(`[builtins] ${filename} → ${key} 已注册`);
      } else {
        log.error({ filename, key }, `[builtins] ${filename} 未导出哨兵对象 (key=${key})`);
      }
    } catch (err: unknown) {
      log.error({ filename, key, err: (err as Error)?.message || String(err), code: 'SENTINEL_REGISTER_FAILED', phase: 2, retryable: false },
        `[builtins] ${filename} 注册失败`);
    }
  }

  const total = registry.count();
  const cronCount = registry.listCronSentinels().length;
  log.info({ registered, total, cronCount, scanned: sentinelFiles.length }, '[builtins] 哨兵自动注册完成');
}

// 哨兵注册表: 文件驱动哨兵由 sentinel-loader.ts 自动发现注册 (V3.8)
// 新增哨兵 = extensions/sentinels/{name}/manifest.json + aggregate.ts → 零代码变更
