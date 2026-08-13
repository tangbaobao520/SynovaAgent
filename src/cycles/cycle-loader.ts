/**
 * src/cycles/cycle-loader.ts — CycleLoader
 *
 * 对标 src/sentinel/sentinel-loader.ts 的文件驱动模式：
 *   目录扫描 → JSON 解析 → 优先级覆盖 → 缓存 → 注册
 *
 * 三目录优先级覆盖: custom/{enterpriseId} > industry/{sector} > builtin
 * 消费 D79 ContextLoader 合并企业循环参数覆盖。
 * 单个文件加载失败仅 errors，不阻断其余文件。
 *
 * 契约:
 *   @input  — 扫描 cycles/{custom,industry,builtin} 目录
 *   @output — { cycles: CycleConfig[], degraded, errors }
 *   @degraded — 部分文件失败仍返回已加载部分
 */
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createLogger } from '@synova/logger';
import type { CycleConfig, ContextLoaderLike } from './cycle-types';

const log = createLogger('cycles/loader');

// ═══ 扫描路径 ═══

const CYCLES_ROOTS = [
  { root: join(process.cwd(), 'cycles', 'custom'), label: 'custom' },
  { root: join(process.cwd(), 'cycles', 'industry'), label: 'industry' },
  { root: join(process.cwd(), 'cycles', 'builtin'), label: 'builtin' },
];

// ═══ Cache ═══

let cache: CycleConfig[] | null = null;

/**
 * 加载所有循环配置。
 *
 * 按 custom > industry > builtin 优先级扫描。
 * 后扫描到的同名 cycleId 覆盖先扫描到的。
 *
 * @param contextLoader — 可选的 D79 ContextLoader 实例（用于合并企业参数）
 * @returns { cycles, degraded, errors }
 */
export function loadCycles(contextLoader?: ContextLoaderLike): { cycles: CycleConfig[]; degraded: boolean; errors: string[] } {
  const errors: string[] = [];

  if (cache) return { cycles: cache, degraded: false, errors: [] };

  const cycles: CycleConfig[] = [];
  const seen = new Set<string>();

  for (const { root, label } of CYCLES_ROOTS) {
    try {
      if (!existsSync(root)) continue;

      const entries = readdirSync(root, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          // 递归扫描子目录（industry/{sector}/xxx.cycle.json）
          const subEntries = readdirSync(join(root, entry.name), { withFileTypes: true });
          for (const sub of subEntries) {
            if (!sub.isFile()) continue;
            if (!sub.name.endsWith('.cycle.json')) continue;
            if (sub.name.startsWith('_')) continue;
            loadCycleFile(join(root, entry.name, sub.name), label, cycles, seen, errors, contextLoader);
          }
        } else if (entry.isFile()) {
          if (!entry.name.endsWith('.cycle.json')) continue;
          if (entry.name.startsWith('_')) continue;
          loadCycleFile(join(root, entry.name), label, cycles, seen, errors, contextLoader);
        }
      }
    } catch (err: unknown) {
      log.warn({ err: err instanceof Error ? err.message : String(err) }, "循环配置存在检查");
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`循环加载失败 (${label}): ${msg}`);
    }
  }

  log.info({ count: cycles.length, errors: errors.length }, 'Cycle 加载完成');
  cache = cycles;
  return { cycles, degraded: errors.length > 0, errors };
}

/** 加载单个 .cycle.json 文件 */
function loadCycleFile(
  filePath: string,
  label: string,
  cycles: CycleConfig[],
  seen: Set<string>,
  errors: string[],
  contextLoader?: ContextLoaderLike,
): void {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    let cycle = JSON.parse(raw) as CycleConfig;

    // 基本校验
    if (!cycle.cycleId || typeof cycle.cycleId !== 'string') {
      errors.push(`循环文件 ${filePath} cycleId 为空`);
      return;
    }
    if (!cycle.nodes || !Array.isArray(cycle.nodes)) {
      errors.push(`循环 ${cycle.cycleId} nodes 缺失`);
      return;
    }
    if (!cycle.overflowFormula || !cycle.overflowFormula.condition) {
      errors.push(`循环 ${cycle.cycleId} overflowFormula 缺失`);
      return;
    }

    // D79 ContextLoader: 合并企业参数覆盖
    if (contextLoader?.getCycleOverrides) {
      try {
        const overrides = contextLoader.getCycleOverrides(cycle.cycleId);
        if (overrides) {
          cycle = { ...cycle, ...overrides };
          log.info({ cycleId: cycle.cycleId }, 'ContextLoader 循环参数已合并');
        }
      } catch {
        log.warn({ cycleId: cycle.cycleId }, 'ContextLoader 合并失败 — 降级');
      }
    }

    // 优先级覆盖
    if (seen.has(cycle.cycleId)) {
      const idx = cycles.findIndex(c => c.cycleId === cycle.cycleId);
      if (idx !== -1) cycles[idx] = cycle;
    } else {
      cycles.push(cycle);
      seen.add(cycle.cycleId);
    }
  } catch (err: unknown) {
    log.warn({ err: err instanceof Error ? err.message : String(err) }, "循环覆盖配置加载");
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`循环文件 ${filePath} 加载失败: ${msg}`);
  }
}

/**
 * 清除缓存。
 */
export function clearCycleCache(): void {
  cache = null;
  log.info('Cycle 缓存已清除');
}

/**
 * 注册已加载的循环到 CycleRegistry。
 */
export async function registerLoadedCycles(contextLoader?: ContextLoaderLike): Promise<{ registered: number; errors: string[] }> {
  const { cycles, errors: loadErrors } = loadCycles(contextLoader);
  const errors = [...loadErrors];
  let registered = 0;

  for (const cycle of cycles) {
    try {
      const { cycleRegistry } = await import('./cycle-registry');
      cycleRegistry.register(cycle);
      registered++;
    } catch (err: unknown) {
      log.warn({ err: err instanceof Error ? err.message : String(err) }, "动态模块加载失败");
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`循环 ${cycle.cycleId} 注册失败: ${msg}`);
    }
  }

  if (registered > 0) log.info({ registered, errors: errors.length }, 'Cycle 已注册');
  return { registered, errors };
}
