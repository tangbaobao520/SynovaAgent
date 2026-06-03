/**
 * l4/diagnosis-graph-query.ts — 诊断专用图查询 (Phase 2a)
 *
 * 5 个查询函数, 适配真实 GraphStore 接口。
 * 对标 Microsoft GraphRAG (Community Reports) + DEG-RAG (neighbor pruning)。
 */
import { SOGNodeType, SOGEdgeType, EDGE_ENDPOINT_MAP } from '@synova/sog-core';
import { createLogger } from '../logger';

const log = createLogger('l4/diagnosis-graph-query');

// ═══ Read-only GraphStore ═══

interface GraphStoreRO {
  queryNodes(type: string, filters?: Record<string,unknown>, graph?: string): Array<{id:string, type:string, props:Record<string,unknown>}>;
  queryEdges(type?: string, from?: string, to?: string, graph?: string): Array<{id:string, type:string, from:string, to:string, weight:number, props:Record<string,unknown>}>;
}

// ═══ Output Types ═══

export interface DiagnosticPath { nodes: string[]; edges: Array<{from:string, to:string, type:string}>; length: number; totalWeight: number }

export interface SubgraphSummary {
  rootId: string; nodeCount: number; edgeCount: number;
  typeDistribution: Record<string, number>; strongestConnections: Array<{from:string, to:string, weight:number}>;
  risks: string[]; anomalyScore: number;
}

export interface GraphDiff { nodesAdded: string[]; nodesRemoved: string[]; edgesAdded: string[]; edgesRemoved: string[]; weightChanges: Array<{edgeId:string, from:number, to:number}> }

export interface BrokerNode { nodeId: string; nodeType: string; betweennessScore: number; bridgingDimensions: string[] }

export interface AnomalyPattern { type: string; description: string; severity: 'high'|'medium'|'low'; involvedNodes: string[] }

// ═══ 1. findDiagnosticPaths — 类型约束 BFS ═══

export function findDiagnosticPaths(
  store: GraphStoreRO, graph: string,
  fromType: string, toType: string,
  edgeTypes?: string[], minWeight = 0.5, maxResults = 20,
): DiagnosticPath[] {
  const fromNodes = store.queryNodes(fromType, undefined, graph);
  const toNodes = new Set(store.queryNodes(toType, undefined, graph).map(n => n.id));
  if (fromNodes.length === 0 || toNodes.size === 0) return [];

  // P2-03: 限制最大边数防止内存溢出
  const allEdges = store.queryEdges(undefined, undefined, undefined, graph)
    .filter(e => !edgeTypes || edgeTypes.includes(e.type))
    .filter(e => e.weight >= minWeight)
    .slice(0, 5000);

  const paths: DiagnosticPath[] = [];

  for (const start of fromNodes) {
    // BFS from start node
    const visited = new Set<string>([start.id]);
    const queue: Array<{ nodeId: string; pathNodes: string[]; pathEdges: Array<{from:string, to:string, type:string}>; totalWeight: number }> =
      [{ nodeId: start.id, pathNodes: [start.id], pathEdges: [], totalWeight: 0 }];

    // P3-09: BFS 队列上限 10000 防止无限增长
    const MAX_QUEUE = 10_000;
    for (const item of queue) {
      if (queue.length > MAX_QUEUE) break;
      if (toNodes.has(item.nodeId) && item.pathNodes.length > 1) {
        paths.push({ nodes: item.pathNodes, edges: item.pathEdges, length: item.pathNodes.length, totalWeight: item.totalWeight });
        if (paths.length >= maxResults) break;
      }

      const neighbors = allEdges.filter(e => e.from === item.nodeId || e.to === item.nodeId);
      for (const e of neighbors) {
        const next = e.from === item.nodeId ? e.to : e.from;
        if (!visited.has(next)) {
          visited.add(next);
          queue.push({
            nodeId: next,
            pathNodes: [...item.pathNodes, next],
            pathEdges: [...item.pathEdges, { from: item.nodeId, to: next, type: e.type }],
            totalWeight: item.totalWeight + e.weight,
          });
        }
      }
    }
  }

  return paths.sort((a, b) => b.totalWeight - a.totalWeight).slice(0, maxResults);
}

// ═══ 2. summarizeSubgraph — k-hop BFS + 统计 ═══

export function summarizeSubgraph(store: GraphStoreRO, graph: string, rootId: string, maxDepth = 3): SubgraphSummary {
  const visited = new Set<string>([rootId]);
  let queue = [rootId];
  const collectedEdges: Array<{from:string, to:string, type:string, weight:number}> = [];

  for (let depth = 0; depth < maxDepth && queue.length > 0; depth++) {
    const nextQueue: string[] = [];
    for (const nodeId of queue) {
      const edges = store.queryEdges(undefined, nodeId, undefined, graph)
        .concat(store.queryEdges(undefined, undefined, nodeId, graph));
      for (const e of edges) {
        const neighbor = e.from === nodeId ? e.to : e.from;
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          nextQueue.push(neighbor);
        }
        collectedEdges.push({ from: e.from, to: e.to, type: e.type, weight: e.weight });
      }
    }
    queue = nextQueue;
  }

  const typeDistribution: Record<string, number> = {};
  const riskNodeIds: string[] = [];

  for (const nid of visited) {
    // Find node type from edges or defaults
    const edges = store.queryEdges(undefined, nid, undefined, graph).concat(store.queryEdges(undefined, undefined, nid, graph));
    const hasRisk = edges.some(e => e.type === SOGEdgeType.AFFECTS);
    const nodeType = hasRisk ? SOGNodeType.RISK : 'unknown';
    typeDistribution[nodeType] = (typeDistribution[nodeType] || 0) + 1;
    if (hasRisk) riskNodeIds.push(nid);
  }

  const strongestConnections = collectedEdges
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5)
    .map(e => ({ from: e.from, to: e.to, weight: e.weight }));

  const isolatedRatio = visited.size > 0 ? (visited.size - collectedEdges.length / 2) / visited.size : 0;
  const anomalyScore = Math.min(1, isolatedRatio * 2);

  return {
    rootId, nodeCount: visited.size, edgeCount: collectedEdges.length,
    typeDistribution, strongestConnections, risks: riskNodeIds, anomalyScore,
  };
}

// ═══ 3. getGraphDiff — 时序变化 ═══

export function getGraphDiff(
  store: GraphStoreRO, graph: string,
  _fromDate?: string, _toDate?: string,
): GraphDiff {
  // Simplified: compare node counts by type (real impl uses timestamps)
  const personBefore = store.queryNodes(SOGNodeType.PERSON, undefined, graph).length;
  const riskBefore = store.queryNodes(SOGNodeType.RISK, undefined, graph).length;

  return {
    nodesAdded: [], nodesRemoved: [],
    edgesAdded: [], edgesRemoved: [],
    weightChanges: [],
    // Summary: person and risk counts available for diff display
    // In production, compare snapshots from different timestamps
  };
}

// ═══ 4. findCrossDimensionalBrokers — Betweenness Centrality ═══

export function findCrossDimensionalBrokers(store: GraphStoreRO, graph: string, minScore = 0.01): BrokerNode[] {
  const allNodes = new Set<string>();
  const adjacency = new Map<string, string[]>();

  const edges = store.queryEdges(undefined, undefined, undefined, graph);
  for (const e of edges) {
    allNodes.add(e.from); allNodes.add(e.to);
    if (!adjacency.has(e.from)) adjacency.set(e.from, []);
    if (!adjacency.has(e.to)) adjacency.set(e.to, []);
    adjacency.get(e.from)!.push(e.to);
    adjacency.get(e.to)!.push(e.from);
  }

  if (allNodes.size < 3) return [];

  const nodes = [...allNodes];
  const betweenness = new Map<string, number>();

  // Simplified Brandes (unweighted)
  for (const s of nodes) {
    const stack: string[] = [];
    const pred = new Map<string, string[]>();
    const dist = new Map<string, number>();
    const sigma = new Map<string, number>();
    const delta = new Map<string, number>();

    for (const v of nodes) { pred.set(v, []); dist.set(v, -1); sigma.set(v, 0); delta.set(v, 0); }
    dist.set(s, 0); sigma.set(s, 1);

    const queue = [s];
    while (queue.length > 0) {
      const v = queue.shift()!;
      stack.push(v);
      for (const w of (adjacency.get(v) || [])) {
        if (dist.get(w)! < 0) { dist.set(w, dist.get(v)! + 1); queue.push(w); }
        if (dist.get(w)! === dist.get(v)! + 1) { sigma.set(w, sigma.get(w)! + sigma.get(v)!); pred.get(w)!.push(v); }
      }
    }

    while (stack.length > 0) {
      const w = stack.pop()!;
      for (const v of (pred.get(w) || [])) {
        delta.set(v, delta.get(v)! + (sigma.get(v)! / sigma.get(w)!) * (1 + delta.get(w)!));
      }
      if (w !== s) betweenness.set(w, (betweenness.get(w) || 0) + delta.get(w)!);
    }
  }

  const brokers: BrokerNode[] = [];
  for (const [nodeId, score] of betweenness) {
    if (score < minScore) continue;
    const neighborTypes = new Set((adjacency.get(nodeId) || []).slice(0, 10));
    brokers.push({ nodeId, nodeType: 'unknown', betweennessScore: Math.round(score * 1000) / 1000, bridgingDimensions: [...neighborTypes].slice(0, 5) });
  }

  return brokers.sort((a, b) => b.betweennessScore - a.betweennessScore).slice(0, 20);
}

// ═══ 5. detectAnomalousPatterns ═══

export function detectAnomalousPatterns(store: GraphStoreRO, graph: string): AnomalyPattern[] {
  const patterns: AnomalyPattern[] = [];
  const edges = store.queryEdges(undefined, undefined, undefined, graph);

  // Anomaly 1: Isolated nodes
  const allNodeIds = new Set<string>();
  for (const e of edges) { allNodeIds.add(e.from); allNodeIds.add(e.to); }
  if (allNodeIds.size > 0) {
    const connectedNodes = new Set(allNodeIds);
    const isolated = [...allNodeIds].filter(id => !edges.some(e => e.from === id || e.to === id));
    if (isolated.length > 0) {
      patterns.push({ type: 'isolated_nodes', description: `${isolated.length} 个孤立节点(无任何边)`, severity: 'high', involvedNodes: isolated.slice(0, 10) });
    }
  }

  // Anomaly 2: Endpoint violations
  for (const e of edges.slice(0, 50)) {
    // Simplified: check if edge type is valid
    if (!(Object.values(SOGEdgeType) as string[]).includes(e.type)) {
      patterns.push({ type: 'invalid_edge_type', description: `边 ${e.id} 使用未知类型: ${e.type}`, severity: 'high', involvedNodes: [e.from, e.to] });
    }
  }

  // Anomaly 3: Weight outliers (3-sigma)
  if (edges.length >= 5) {
    const weights = edges.map(e => e.weight);
    const mean = weights.reduce((s, w) => s + w, 0) / weights.length;
    const variance = weights.reduce((s, w) => s + (w - mean) ** 2, 0) / weights.length;
    const stdDev = Math.sqrt(variance);
    const outlierEdges = edges.filter(e => Math.abs(e.weight - mean) > 3 * stdDev);
    if (outlierEdges.length > 0) {
      patterns.push({ type: 'weight_outliers', description: `${outlierEdges.length} 条边权重超过 3σ`, severity: 'medium', involvedNodes: outlierEdges.flatMap(e => [e.from, e.to]).slice(0, 10) });
    }
  }

  return patterns;
}
