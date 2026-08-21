/**
 * services/memory-access-service.ts — 记忆读取服务 (L2 编排层)
 *
 * 为 L1 路由层提供 AgentMemoryStore (L4) 的安全访问封装。
 * 铁律 39: L1 不得直接触 L4 —— routes 通过本服务访问，保持层边界。
 *
 * 契约:
 *   @input  — listByType(type, limit) / list(query) / remember(entry)
 *   @output — MemoryEntry[] / MemoryEntry
 *   @degraded — AgentMemoryStore 不可用时返回空数组 / 抛错给调用方降级
 *   @error  — MEMORY_STORE_UNAVAILABLE
 */
import { createLogger } from '@synova/logger';
import { getAgentMemoryStore, type MemoryQuery, type MemoryEntry } from '../l4/agent-memory-store';
import { getDatabase } from '../init/engine-context';

const log = createLogger('services/memory-access');

/**
 * 按类型列出记忆（跨组织 — 通知系统等全局查询）。
 * 降级：AgentMemoryStore 不可用 → 返回空数组（调用方展示降级）。
 */
export function listMemoryByType(type: string, limit = 50): MemoryEntry[] {
  try {
    return getAgentMemoryStore(getDatabase()).listByType(type, limit);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ err: msg, type }, '记忆按类型查询失败 — degraded');
    return [];
  }
}

/**
 * 按查询条件列出记忆（orgId + type + tags 过滤）。
 * 降级：AgentMemoryStore 不可用 → 返回空数组（调用方展示降级）。
 */
export function listMemory(query: MemoryQuery): MemoryEntry[] {
  try {
    return getAgentMemoryStore(getDatabase()).list(query);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ err: msg, orgId: query.orgId }, '记忆查询失败 — degraded');
    return [];
  }
}

/**
 * 写入一条记忆（action 持久化等）。
 * 降级：AgentMemoryStore 不可用 → 返回 null（调用方仅内存存储）。
 */
export function rememberMemory(
  entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt' | 'accessCount'>,
): MemoryEntry | null {
  try {
    return getAgentMemoryStore(getDatabase()).remember(entry);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ err: msg, key: entry.key }, '记忆写入失败 — degraded');
    return null;
  }
}
