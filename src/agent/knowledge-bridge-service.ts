/**
 * agent/knowledge-bridge-service.ts — L2 知识存储桥接服务
 * @state: real
 *
 * L1→L2 ✅ | L2→L4 ✅
 * 提供 KnowledgeStore 和诊断图查询的 L2 封装，
 * L1 路由通过此服务访问，不直接 import L4。
 */

import { KnowledgeStore, type KnowledgeChunk, type FilterClause } from '../l4/knowledge-store';
import { summarizeSubgraph, findCrossDimensionalBrokers, getGraphDiff } from '../l4/diagnosis-graph-query';

// Re-export for L1 routes (FIXME: Phase 3 — 完全封装 L4 方法为 L2 服务)
export { KnowledgeStore, type KnowledgeChunk, type FilterClause };

// ═══ KnowledgeStore 桥接 ═══

let _ks: KnowledgeStore | null = null;
function getKS(): KnowledgeStore { if (!_ks) _ks = new KnowledgeStore(); return _ks; }

export function searchKnowledge(query: string, filter?: FilterClause): KnowledgeChunk[] {
  return getKS().search(query, filter);
}
export function ingestKnowledge(chunk: Omit<KnowledgeChunk, 'id' | 'createdAt'>): KnowledgeChunk {
  return getKS().ingest(chunk);
}
export function getKnowledgeChunks(filter?: FilterClause): KnowledgeChunk[] {
  return getKS().list(filter);
}
export function deleteKnowledgeChunk(id: string): void {
  getKS().delete(id);
}
export function updateKnowledgePermissions(id: string, permissions: Record<string, unknown>): void {
  getKS().updatePermissions(id, permissions);
}

// ═══ 诊断图查询桥接 ═══

export { summarizeSubgraph, findCrossDimensionalBrokers, getGraphDiff };
