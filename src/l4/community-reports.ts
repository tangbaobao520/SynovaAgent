/**
 * l4/community-reports.ts — 图社区发现 + 摘要生成 (Phase 2b)
 *
 * 对标 Microsoft GraphRAG (arxiv 2404.16130):
 *   Community Reports — 图社区检测 → 每个社区生成自然语言摘要
 *
 * 简化 Leiden 社区检测 + 结构化报告生成。
 */
import { ALL_NODE_TYPES, NodeType } from '@synova/ontology';
import { createLogger } from '@synova/logger';

const log = createLogger('l4/community-reports');

// ═══ Types ═══

interface GraphStoreRO {
  queryEdges(type?: string, from?: string, to?: string, graph?: string): Array<{from:string, to:string, weight:number}>;
  queryNodes(type: string, filters?: Record<string,unknown>, graph?: string): Array<{id:string, type:string, props:Record<string,unknown>}>;
}

export interface CommunityReport {
  id: string;
  nodeCount: number;
  dominantTypes: string[];
  summary: string;
  keyNodes: string[];
}

// P2-02: TTL 缓存避免每次全量重算
const communityReportCache = new Map<string, { reports: CommunityReport[]; cachedAt: number }>();
const CACHE_TTL_MS = 60_000; // 60 秒

// ═══ Simplified Leiden Community Detection ═══

function detectCommunities(edges: Array<{from:string, to:string, weight:number}>, resolution = 1.0): Map<string, number> {
  // Phase 1: local moving
  const community = new Map<string, number>();
  const adjacency = new Map<string, Map<string, number>>();

  for (const e of edges) {
    if (!adjacency.has(e.from)) adjacency.set(e.from, new Map());
    if (!adjacency.has(e.to)) adjacency.set(e.to, new Map());
    adjacency.get(e.from)!.set(e.to, (adjacency.get(e.from)!.get(e.to) || 0) + e.weight);
    adjacency.get(e.to)!.set(e.from, (adjacency.get(e.to)!.get(e.from) || 0) + e.weight);
  }

  // Initialize: each node in its own community
  const nodeIds = [...new Set(edges.flatMap(e => [e.from, e.to]))];
  nodeIds.forEach((id, i) => community.set(id, i));

  // Total edge weight
  const totalWeight = edges.reduce((s, e) => s + e.weight, 0);
  if (totalWeight === 0) return community;

  let improved = true;
  let iterations = 0;
  while (improved && iterations < 10) {
    improved = false; iterations++;

    for (const node of nodeIds) {
      const neighbors = adjacency.get(node);
      if (!neighbors || neighbors.size === 0) continue;

      const currentComm = community.get(node)!;
      const commWeights = new Map<number, number>();

      for (const [neighbor, weight] of neighbors) {
        const neighborComm = community.get(neighbor)!;
        commWeights.set(neighborComm, (commWeights.get(neighborComm) || 0) + weight);
      }

      // Remove current community weight
      const currentWeight = commWeights.get(currentComm) || 0;
      commWeights.set(currentComm, currentWeight);

      // Find best community
      let bestComm = currentComm;
      let bestGain = 0;
      for (const [comm, w] of commWeights) {
        const gain = w / totalWeight - resolution;
        if (gain > bestGain) { bestGain = gain; bestComm = comm; }
      }

      if (bestComm !== currentComm) {
        community.set(node, bestComm);
        improved = true;
      }
    }
  }

  return community;
}

// ═══ Community Reports ═══

export function generateCommunityReports(store: GraphStoreRO, graph: string): CommunityReport[] {
  // P2-02: TTL 缓存 — 同一 graph 60s 内直接返回
  const cached = communityReportCache.get(graph);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) return cached.reports;

  const edges = store.queryEdges(undefined, undefined, undefined, graph);
  if (edges.length < 2) return [];

  const communities = detectCommunities(edges);

  // Group nodes by community
  const commNodes = new Map<number, string[]>();
  for (const [node, comm] of communities) {
    if (!commNodes.has(comm)) commNodes.set(comm, []);
    commNodes.get(comm)!.push(node);
  }

  const reports: CommunityReport[] = [];

  for (const [commId, nodes] of commNodes) {
    if (nodes.length < 2) continue; // Skip singletons

    // Find dominant node types in this community
    const typeCount = new Map<string, number>();
    for (const nodeId of nodes) {
      // Look up node type from all node types
      for (const ntype of ALL_NODE_TYPES) {
        const found = store.queryNodes(ntype, undefined, graph);
        if (found.some(n => n.id === nodeId)) {
          typeCount.set(ntype, (typeCount.get(ntype) || 0) + 1);
          break;
        }
      }
    }

    const dominantTypes = [...typeCount.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([t]) => t);

    // Generate summary
    const typeSummary = dominantTypes.length > 0
      ? `主要由${dominantTypes.join('、')}类型节点构成`
      : '节点类型多样';

    reports.push({
      id: `community_${commId}`,
      nodeCount: nodes.length,
      dominantTypes,
      summary: `社区${commId}: ${nodes.length}个节点, ${typeSummary}。共${edges.filter(e => nodes.includes(e.from) || nodes.includes(e.to)).length}条内部边。`,
      keyNodes: nodes.slice(0, 5),
    });
  }

  const sorted = reports.sort((a, b) => b.nodeCount - a.nodeCount);
  communityReportCache.set(graph, { reports: sorted, cachedAt: Date.now() });
  log.info({ communityCount: sorted.length }, '社区报告生成完成');
  return sorted;
}

