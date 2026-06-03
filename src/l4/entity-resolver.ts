/**
 * l4/entity-resolver.ts — L3 语义实体解析 (Phase 3a)
 *
 * 轻量方案 (不引入 @xenova/transformers 80MB 模型):
 *   - 文本相似度: Jaccard token overlap (name + email)
 *   - 结构相似度: 14 维邻居类型分布向量
 *   - 融合得分: 0.6 * textSim + 0.4 * structSim
 *   - 阈值: auto_merge >= 0.85, review [0.65, 0.85), ignore < 0.65
 *   - 仅比较同类型节点 (blocking)
 */
import { SOGNodeType, SOGEdgeType } from '@synova/sog-core';
import { createLogger } from '../logger';

const log = createLogger('l4/entity-resolver');

// ═══ Types ═══

interface GraphStoreRO {
  queryNodes(type: string): Array<{id:string, type:string, props:Record<string,unknown>}>;
  queryEdges(type?: string, from?: string, to?: string): Array<{from:string, to:string, type:string}>;
}

export interface EntityMatch {
  entityA: { id:string; type:string };
  entityB: { id:string; type:string };
  textSimilarity: number;
  structuralSimilarity: number;
  fusedScore: number;
  confidence: 'auto_merge' | 'review' | 'ignore';
}

export interface L3ResolutionResult {
  matches: EntityMatch[];
  autoMerged: number;
  queuedForReview: number;
  ignored: number;
}

// ═══ Core ═══

export function resolveEntitiesL3(store: GraphStoreRO, graph: string): L3ResolutionResult {
  const matches: EntityMatch[] = [];
  const nodeTypes = Object.values(SOGNodeType);

  for (const type of nodeTypes) {
    const nodes = store.queryNodes(type).filter(n => n.props);
    if (nodes.length < 2) continue;

    // Pairwise comparison within same type (blocking)
    for (let i = 0; i < Math.min(nodes.length, 100); i++) {
      for (let j = i + 1; j < Math.min(nodes.length, 100); j++) {
        const textSim = computeTextSimilarity(nodes[i].props, nodes[j].props);
        const structSim = computeStructuralSimilarity(nodes[i].id, nodes[j].id, store);
        const fusedScore = 0.6 * textSim + 0.4 * structSim;

        let confidence: EntityMatch['confidence'] = 'ignore';
        if (fusedScore >= 0.85) confidence = 'auto_merge';
        else if (fusedScore >= 0.65) confidence = 'review';

        matches.push({
          entityA: { id: nodes[i].id, type },
          entityB: { id: nodes[j].id, type },
          textSimilarity: Math.round(textSim * 1000) / 1000,
          structuralSimilarity: Math.round(structSim * 1000) / 1000,
          fusedScore: Math.round(fusedScore * 1000) / 1000,
          confidence,
        });
      }
    }
  }

  const autoMerged = matches.filter(m => m.confidence === 'auto_merge').length;
  const queuedForReview = matches.filter(m => m.confidence === 'review').length;
  const ignored = matches.filter(m => m.confidence === 'ignore').length;

  log.info({ autoMerged, queuedForReview, ignored }, 'L3 实体解析完成');
  return { matches, autoMerged, queuedForReview, ignored };
}

// ═══ Text Similarity — Jaccard token overlap ═══

function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9一-鿿@._-]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 0),
  );
}

function computeTextSimilarity(propsA: Record<string,unknown>, propsB: Record<string,unknown>): number {
  const fields = ['name', 'email', 'description', 'role'];
  const tokensA = new Set<string>();
  const tokensB = new Set<string>();

  for (const field of fields) {
    const valA = String(propsA[field] || '');
    const valB = String(propsB[field] || '');
    for (const t of tokenize(valA)) tokensA.add(t);
    for (const t of tokenize(valB)) tokensB.add(t);
  }

  if (tokensA.size === 0 && tokensB.size === 0) return 0;

  const intersection = new Set([...tokensA].filter(t => tokensB.has(t)));
  const union = new Set([...tokensA, ...tokensB]);
  return intersection.size / union.size;
}

// ═══ Structural Similarity — neighbor type distribution ═══

function computeStructuralSimilarity(nodeIdA: string, nodeIdB: string, store: GraphStoreRO): number {
  const getNeighborTypes = (nodeId: string): number[] => {
    const edges = [
      ...store.queryEdges(undefined, nodeId, undefined),
      ...store.queryEdges(undefined, undefined, nodeId),
    ];
    // Count neighbor types (14-dim vector)
    const typeCounts = new Map<string, number>();
    for (const e of edges.slice(0, 50)) {
      const neighborId = e.from === nodeId ? e.to : e.from;
      // Simplified: just count edges as proxy
      typeCounts.set(e.type, (typeCounts.get(e.type) || 0) + 1);
    }
    return Object.values(SOGEdgeType).map(et => typeCounts.get(et) || 0);
  };

  const vecA = getNeighborTypes(nodeIdA);
  const vecB = getNeighborTypes(nodeIdB);

  // Cosine similarity
  const dotProduct = vecA.reduce((s, v, i) => s + v * vecB[i], 0);
  const magA = Math.sqrt(vecA.reduce((s, v) => s + v * v, 0));
  const magB = Math.sqrt(vecB.reduce((s, v) => s + v * v, 0));

  if (magA === 0 && magB === 0) return 1; // Both isolated → structurally similar
  if (magA === 0 || magB === 0) return 0;
  return dotProduct / (magA * magB);
}
