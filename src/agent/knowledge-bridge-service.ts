/**
 * agent/knowledge-bridge-service.ts — L2 知识存储桥接服务
 * @state: real
 *
 * L1→L2 ✅ | L2→L4 ✅
 * L1 路由通过此服务 import KnowledgeStore 类型和类，不直接 import L4。
 * D603 跨层修复（扫描报告 §三 簇3）: 构造也经此服务——createSystemKnowledgeStore()
 * 把 `new KnowledgeStore(getDatabase())` 从 L1 路由移入 L2（铁律 39，getDatabase
 * 从 L1 清零）；注入优先语义（setKnowledgeStore / app.locals）由调用方保留。
 *
 * Phase 3: 将路由中的 store 操作封装为 L2 服务方法。
 */

import { KnowledgeStore } from '../l4/knowledge-store';
import { getDatabase } from '../init/engine-context';

// Re-export from L4 → L2 bridge
export { KnowledgeStore } from '../l4/knowledge-store';
export type { KnowledgeChunk, FilterClause } from '../l4/knowledge-store';

/**
 * createSystemKnowledgeStore — 全局 db 上的 KnowledgeStore 兜底构造。
 * 行为与修复前 L1 路由内 `new KnowledgeStore(getDatabase())` 逐字节一致；
 * getDatabase() 未初始化时抛出（fail-closed，admin-knowledge 的 ??= 不缓存失败
 * 语义不变）。
 */
export function createSystemKnowledgeStore(): KnowledgeStore {
  return new KnowledgeStore(getDatabase());
}

// 诊断图查询
// V4.2.3: diagnosis-graph-query.ts 已删除 — re-export 移除
