/**
 * agent/knowledge-bridge-service.ts — L2 知识存储桥接服务
 * @state: real
 *
 * L1→L2 ✅ | L2→L4 ✅
 * L1 路由通过此服务 import KnowledgeStore 类型和类，不直接 import L4。
 * 路由仍使用 new KnowledgeStore(getDatabase()) 模式——类定义来自 L2 桥接。
 *
 * Phase 3: 将路由中的 store 操作封装为 L2 服务方法。
 */

// Re-export from L4 → L2 bridge
export { KnowledgeStore } from '../l4/knowledge-store';
export type { KnowledgeChunk, FilterClause } from '../l4/knowledge-store';

// 诊断图查询
// V4.2.3: diagnosis-graph-query.ts 已删除 — re-export 移除
