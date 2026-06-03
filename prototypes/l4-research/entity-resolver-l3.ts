/**
 * entity-resolver-l3.ts — L3 语义实体解析 (L4 Research Prototype)
 *
 * 对标 DEG-RAG + CSGAT：轻量级嵌入匹配 + 图结构特征融合。
 * 不训练 GNN，使用预训练 sentence-transformers 模型做文本嵌入。
 *
 * 三级解析体系：
 *   L1 (已实现): 8 条确定规则 —— 同类型+同名+同属性 → 直接合并
 *   L2 (已实现): Jaccard 模糊匹配 + 内存 review 队列
 *   L3 (本文件): 语义嵌入 + 图邻居结构融合 → 自动合并高置信度 / 入队低置信度
 *
 * 依赖：需安装 @xenova/transformers (浏览器/Node 端推理) 或调用 sentence-transformers API
 */

import type { GraphStore, GraphNode } from '../diagnosis/graph-store';
import { SOGNodeType } from '@synova/sog-core';

// ═══ Types ═══

export interface EntityMatch {
  entityA: string;   // node ID
  entityB: string;   // node ID
  textSimilarity: number;   // cosine similarity of text embeddings
  structuralSimilarity: number; // cosine similarity of neighbor type distributions
  fusedScore: number;       // weighted combination
  confidence: 'high' | 'medium' | 'low';
  action: 'auto_merge' | 'review' | 'ignore';
}

export interface L3ResolutionResult {
  matches: EntityMatch[];
  autoMerged: number;
  queuedForReview: number;
  ignored: number;
}

// ═══ Config ═══

const CONFIG = {
  /** 文本相似度权重 (0-1)，剩余权重给结构相似度 */
  TEXT_WEIGHT: 0.6,
  /** 自动合并阈值 */
  AUTO_MERGE_THRESHOLD: 0.85,
  /** 入队审核阈值（低于此值忽略） */
  REVIEW_THRESHOLD: 0.65,
  /** Blocking 策略：每种类型单独处理（DEG-RAG 类型感知 Blocking） */
  BLOCKING_STRATEGY: 'type_aware' as const,
};

// ═══ Text Embedding (Placeholder — 实际使用 @xenova/transformers) ═══

/**
 * 实体文本嵌入。
 *
 * 生产环境接入方案：
 *   1. @xenova/transformers + all-MiniLM-L6-v2 (本地推理, ~80MB, 无需 GPU)
 *   2. 或 sentence-transformers API (如 self-hosted)
 *
 * 嵌入输入格式：`[type] name: props_summary`
 *   例：`[PERSON] Alice: role=Engineer, team=Platform`
 */
async function encodeEntityText(node: GraphNode): Promise<number[]> {
  // Placeholder: 生产环境替换为实际模型调用
  // const { pipeline } = await import('@xenova/transformers');
  // const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  // const text = `[${node.type}] ${node.props?.name ?? node.id}: ${JSON.stringify(node.props).slice(0, 300)}`;
  // const result = await embedder(text, { pooling: 'mean', normalize: true });
  // return Array.from(result.data);

  // Fallback: simple hash-based pseudo-embedding for prototyping
  const text = `${node.type}:${node.props?.name ?? node.id}`;
  const hash = Array.from({ length: 64 }, (_, i) => {
    let v = 0;
    for (let j = 0; j < text.length; j++) {
      v = (v * 31 + text.charCodeAt(j)) % 1000;
    }
    return (Math.sin(v * (i + 1) * 0.01) + 1) / 2; // deterministic pseudo-embedding
  });

  // Normalize
  const norm = Math.sqrt(hash.reduce((s, v) => s + v * v, 0));
  return hash.map(v => v / (norm || 1));
}

// ═══ Structural Encoding ═══

/**
 * 图结构嵌入：1-hop 邻居的类型分布向量。
 * 维度 = 14 (SOGNodeType 数量)，每维是各类型邻居的计数（归一化）。
 *
 * 对标 CSGAT 的 GAT 层——用邻居类型分布作为图结构信号。
 */
function encodeNeighborStructure(
  node: GraphNode,
  store: GraphStore,
  graph: string,
): number[] {
  const typeCounts = new Array(14).fill(0);
  const typeIndex: Record<string, number> = {};
  let idx = 0;
  for (const t of Object.values(SOGNodeType)) {
    typeIndex[t] = idx++;
  }

  try {
    // Outgoing edges
    const outTriples = store.queryTriples(graph, { fromId: node.id });
    for (const t of outTriples) {
      const toNode = store.queryNodes(graph, { id: t.toId })[0];
      if (toNode && typeIndex[toNode.type] !== undefined) {
        typeCounts[typeIndex[toNode.type]]++;
      }
    }

    // Incoming edges (reverse lookup — may be expensive on large graphs)
    const allTriples = store.queryTriples(graph, { toId: node.id }); // needs GraphStore support
    for (const t of allTriples) {
      const fromNode = store.queryNodes(graph, { id: t.fromId })[0];
      if (fromNode && typeIndex[fromNode.type] !== undefined) {
        typeCounts[typeIndex[fromNode.type]]++;
      }
    }
  } catch {
    // 降级：只使用零向量
  }

  // Normalize
  const total = typeCounts.reduce((a, b) => a + b, 0) || 1;
  return typeCounts.map(c => c / total);
}

// ═══ Cosine Similarity ═══

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ═══ Main Resolution Function ═══

/**
 * L3 语义实体解析。
 *
 * Blocking 策略（DEG-RAG 类型感知）：每种 SOGNodeType 单独处理，避免跨类型误匹配。
 * 匹配流程：文本嵌入 → 图结构嵌入 → 融合得分 → 自动合并/入队/忽略。
 */
export async function resolveEntitiesL3(
  store: GraphStore,
  graph: string,
): Promise<L3ResolutionResult> {
  const allMatches: EntityMatch[] = [];
  let autoMerged = 0;
  let queuedForReview = 0;
  let ignored = 0;

  try {
    // Blocking: Group by node type (DEG-RAG type-aware blocking)
    const nodeTypes = Object.values(SOGNodeType);

    for (const nodeType of nodeTypes) {
      const nodes = store.queryNodes(graph, { type: nodeType });
      if (nodes.length < 2) continue; // need at least 2 to compare

      // Compute embeddings for all nodes of this type
      const embeddings: Array<{ node: GraphNode; textEmb: number[]; structEmb: number[] }> = [];
      for (const node of nodes) {
        const textEmb = await encodeEntityText(node);
        const structEmb = encodeNeighborStructure(node, store, graph);
        embeddings.push({ node, textEmb, structEmb });
      }

      // Pairwise comparison (O(n²) within each type — acceptable for <10K nodes per type)
      for (let i = 0; i < embeddings.length; i++) {
        for (let j = i + 1; j < embeddings.length; j++) {
          const a = embeddings[i];
          const b = embeddings[j];

          const textSim = cosineSimilarity(a.textEmb, b.textEmb);
          const structSim = cosineSimilarity(a.structEmb, b.structEmb);
          const fusedScore = CONFIG.TEXT_WEIGHT * textSim + (1 - CONFIG.TEXT_WEIGHT) * structSim;

          let confidence: EntityMatch['confidence'];
          let action: EntityMatch['action'];

          if (fusedScore >= CONFIG.AUTO_MERGE_THRESHOLD) {
            confidence = 'high';
            action = 'auto_merge';
            autoMerged++;
          } else if (fusedScore >= CONFIG.REVIEW_THRESHOLD) {
            confidence = 'medium';
            action = 'review';
            queuedForReview++;
          } else {
            confidence = 'low';
            action = 'ignore';
            ignored++;
          }

          allMatches.push({
            entityA: a.node.id,
            entityB: b.node.id,
            textSimilarity: textSim,
            structuralSimilarity: structSim,
            fusedScore,
            confidence,
            action,
          });
        }
      }
    }
  } catch (err) {
    console.warn('[EntityResolverL3] Resolution failed:', err);
  }

  return {
    matches: allMatches,
    autoMerged,
    queuedForReview,
    ignored,
  };
}

/**
 * 应用自动合并决策。
 * 将 auto_merge 的实体对在 GraphStore 中合并（使用 entity-registry 的 mergePersonNodes 模式）。
 */
export function applyAutoMerges(
  store: GraphStore,
  graph: string,
  matches: EntityMatch[],
): { merged: number; failed: number } {
  let merged = 0;
  let failed = 0;

  const autoMergeMatches = matches.filter(m => m.action === 'auto_merge');
  for (const match of autoMergeMatches) {
    try {
      // 获取两个节点的所有入边/出边，重新指向被合并的节点
      const nodeB = store.queryNodes(graph, { id: match.entityB })[0];
      if (!nodeB) continue;

      // 将 entityB 的所有入边重定向到 entityA
      const inEdges = store.queryTriples(graph, { toId: match.entityB });
      for (const edge of inEdges) {
        store.createEdge({
          ...edge,
          id: `${edge.fromId}--${edge.type}-->${match.entityA}`,
          toId: match.entityA,
        });
      }

      // 将 entityB 的所有出边重定向到 entityA
      const outEdges = store.queryTriples(graph, { fromId: match.entityB });
      for (const edge of outEdges) {
        store.createEdge({
          ...edge,
          id: `${match.entityA}--${edge.type}-->${edge.toId}`,
          fromId: match.entityA,
        });
      }

      // 软删除 entityB（或标记为 merged_into entityA）
      store.deleteNode(graph, match.entityB);
      merged++;
    } catch (err) {
      console.warn(`[L3] Auto-merge failed for ${match.entityA} ← ${match.entityB}:`, err);
      failed++;
    }
  }

  return { merged, failed };
}
