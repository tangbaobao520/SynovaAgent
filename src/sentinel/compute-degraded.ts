/**
 * src/sentinel/compute-degraded.ts — compute 模块降级包装器
 *
 * src/sentinel/compute/ 目录已删除 (V3.7 Batch 2)。
 * 原有 compute 函数是 engine-core 桥接文件 (铁律 46 禁止)。
 * 此包装器为旧哨兵适配器提供降级路径——compute 不可用时返回 null。
 *
 * 正确路径 (正在建设中): extensions/sentinels/{name}/aggregate.ts
 */
import { createLogger } from '../logger';

const log = createLogger('sentinel/compute-degraded');

/**
 * 安全加载已迁移的 compute 模块。
 * compute 目录已删除 → 始终返回 null + 降级日志。
 * 旧哨兵适配器调用此函数替代直接 import('../../sentinel/compute/...')。
 */
export async function loadComputeDegraded<T>(moduleName: string): Promise<T | null> {
  log.warn({ module: moduleName }, 'compute 模块已迁移到 extensions/sentinels/ — 旧哨兵降级');
  return null;
}
