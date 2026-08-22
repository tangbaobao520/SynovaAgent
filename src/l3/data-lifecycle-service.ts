/**
 * l3/data-lifecycle-service.ts — D40 数据生命周期编排 (L3 洞察层)
 *
 * 封装 DataExporter + DataPurger 的依赖创建和调用。
 * 铁律 39: L3 → L4/L5 合法（通过相邻层通信）。
 */
import { createLogger } from '@synova/logger';
import { PolicyEngine, StandardOperations } from '../security/policy-engine';
import { DataExporter, type ExportManifest } from '../l4/data-exporter';
import { DataPurger, type PurgeJob, type PurgeResult } from '../l4/data-purger';
import type { GraphStore } from '../l4/graph-bridge';
import { SessionStore } from '../store/session-store';
import { getAgentMemoryStore } from '../l4/agent-memory-store';
import { getDatabase } from '../init/engine-context';

const log = createLogger('l3/data-lifecycle');

export interface ExportResponse {
  archive: string;
  manifest: ExportManifest;
}

/**
 * 检查 PolicyEngine 权限。
 * @returns null=允许, string=拒绝原因
 */
export function checkPolicy(role: string, soi: string): string | null {
  try {
    const engine = new PolicyEngine();
    const decision = engine.evaluate({ role, dataLevel: 'S3', soi });
    if (!decision.allow) {
      return decision.denyReason || '权限不足';
    }
    return null;
  } catch (err: unknown) {
    log.error({ err, role, soi }, 'PolicyEngine 评估异常');
    return '权限评估异常';
  }
}

/**
 * 执行数据导出。
 * @param graphStore - 运行时注入的 GraphStore 实例（L1 传递，L3 内部转换）
 */
export async function executeExport(
  graphStore: unknown,
  tenantId: string,
): Promise<ExportResponse> {
  const gs = graphStore as GraphStore;
  const sessionStore = new SessionStore(getDatabase());
  const memoryStore = getAgentMemoryStore();
  const exporter = new DataExporter(gs, sessionStore, memoryStore);

  const { archive, manifest } = await exporter.export(tenantId);
  log.info({ tenantId, summary: manifest.summary }, '数据导出完成');

  return {
    archive: archive.toString('base64'),
    manifest,
  };
}

/**
 * 执行数据清除。
 * @param graphStore - 运行时注入的 GraphStore 实例
 */
export async function executePurge(
  graphStore: unknown,
  tenantId: string,
  immediate: boolean,
): Promise<PurgeResult> {
  const gs = graphStore as GraphStore;
  const sessionStore = new SessionStore(getDatabase());
  const memoryStore = getAgentMemoryStore();
  // D338: 清除操作显式绑定 tenantId 租户图，绝不回落全局 'default'
  const purger = new DataPurger(gs, sessionStore, memoryStore, tenantId);

  const result = await purger.purge(tenantId, immediate);
  log.info({ tenantId, purgeId: result.job.id }, '数据清除已发起');
  return result;
}

/**
 * 查询清除任务状态。
 */
export function queryPurgeStatus(
  graphStore: unknown,
  purgeId: string,
): PurgeJob | null {
  const gs = graphStore as GraphStore;
  const sessionStore = new SessionStore(getDatabase());
  const memoryStore = getAgentMemoryStore();
  const purger = new DataPurger(gs, sessionStore, memoryStore);
  return purger.getStatus(purgeId);
}
