/**
 * src/playbook/playbook-loader.ts — Playbook 加载器
 *
 * 对标 sentinel-loader.ts 的文件驱动模式：
 *   目录扫描 → YAML 解析 → 缓存 → 注册
 *
 * 从 extensions/playbooks/{custom,industry,builtin} 目录加载 Playbook YAML，
 * 按 custom > industry > builtin 优先级覆盖同名 Playbook。
 *
 * 设计原则:
 *   - 空目录不崩溃，返回 { playbooks: [], degraded: false, errors: [] }
 *   - 缓存结果直到 clearPlaybookCache() 调用
 *   - 单 YAML 解析失败仅记录 errors，不影响其他 Playbook
 */
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join, parse } from 'path';
import { load as parseYaml } from 'js-yaml';
import { createLogger } from '@synova/logger';
import type { PlaybookDefinition } from './playbook-types';
import type { PlaybookExecutionRecord } from './playbook-types';

const log = createLogger('playbook/loader');

// ═══ 扫描路径（按优先级排列：custom > industry > builtin） ═══

const PLAYBOOK_ROOTS = [
  join(process.cwd(), 'extensions', 'playbooks', 'custom'),
  join(process.cwd(), 'extensions', 'playbooks', 'industry'),
  join(process.cwd(), 'extensions', 'playbooks', 'builtin'),
];

// ═══ Cache ═══

let cache: PlaybookDefinition[] | null = null;

/**
 * 扫描 extensions/playbooks/ 目录，加载所有 Playbook YAML 文件。
 *
 * 按 custom > industry > builtin 优先级覆盖。
 *
 * @returns { playbooks: PlaybookDefinition[], degraded: boolean, errors: string[] }
 *
 * - 空目录 → { playbooks: [], degraded: false, errors: [] }
 * - YAML 解析失败 → errors[]，继续扫描
 * - 目录不存在不报错
 * - 不递归子目录，仅扫描根目录下的 .yaml/.yml 文件
 */
export function loadPlaybooks(): { playbooks: PlaybookDefinition[]; degraded: boolean; errors: string[] } {
  const errors: string[] = [];

  if (cache) return { playbooks: cache, degraded: false, errors: [] };

  const playbooks: PlaybookDefinition[] = [];
  const seen = new Set<string>(); // 追踪同名 playbook

  for (const root of PLAYBOOK_ROOTS) {
    try {
      if (!existsSync(root)) continue;

      const entries = readdirSync(root, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const ext = parse(entry.name).ext.toLowerCase();
        if (ext !== '.yaml' && ext !== '.yml') continue;
        if (entry.name.startsWith('_')) continue; // 模板文件

        const yamlPath = join(root, entry.name);
        try {
          const raw = readFileSync(yamlPath, 'utf-8');
          const doc = parseYaml(raw) as Record<string, unknown>;

          // 基本校验：id 不能为空
          if (!doc || typeof doc.id !== 'string' || !doc.id.trim()) {
            errors.push(`Playbook ${entry.name} id 为空或格式不正确`);
            continue;
          }

          const playbook = doc as unknown as PlaybookDefinition;

          // 优先级覆盖：后扫描到的（higher priority）覆盖先扫描到的
          if (seen.has(playbook.id)) {
            const idx = playbooks.findIndex(p => p.id === playbook.id);
            if (idx !== -1) {
              playbooks[idx] = playbook;
            }
          } else {
            playbooks.push(playbook);
            seen.add(playbook.id);
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`Playbook ${entry.name} YAML 解析失败: ${msg}`);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Playbook 加载失败 (root: ${root}): ${msg}`);
    }
  }

  log.info({ count: playbooks.length, errors: errors.length }, 'Playbook 加载完成');
  cache = playbooks;
  return { playbooks, degraded: errors.length > 0, errors };
}

/**
 * 清除缓存（用于热加载或测试重置）。
 */
export function clearPlaybookCache(): void {
  cache = null;
  log.info('Playbook 缓存已清除');
}

/**
 * 将已加载的 Playbook 注册到全局 PlaybookRegistry。
 * 返回注册结果统计。
 */
export async function registerLoadedPlaybooks(): Promise<{ registered: number; errors: string[] }> {
  const { playbooks, errors: loadErrors } = loadPlaybooks();
  const errors = [...loadErrors];
  let registered = 0;

  for (const playbook of playbooks) {
    try {
      // 动态导入 registry 避免循环依赖
      const { playbookRegistry } = await import('./playbook-registry');
      playbookRegistry.register(playbook);
      registered++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Playbook ${playbook.id} 注册失败: ${msg}`);
    }
  }

  if (registered > 0) log.info({ registered, errors: errors.length }, 'Playbook 已注册');
  return { registered, errors };
}

/**
 * 记录 Playbook 执行结果（D80）。
 *
 * 在 Playbook 执行完成后调用，将执行轨迹写入 execution-store。
 *
 * 降级: 写入失败 → log.warn + 返回 false（不阻断上层流程）
 */
export function recordPlaybookExecution(
  record: PlaybookExecutionRecord,
  store: { createExecutionRecord(r: PlaybookExecutionRecord): string },
): boolean {
  try {
    store.createExecutionRecord(record);
    return true;
  } catch (err) {
    log.warn({ err, executionId: record.executionId }, 'Playbook执行记录写入失败 — 不阻断');
    return false;
  }
}
