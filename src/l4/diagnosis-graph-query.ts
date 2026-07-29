/**
 * l4/diagnosis-graph-query.ts — Phase 2a: 诊断图查询函数
 *
 * 5 个函数，在 GraphStore 上做图分析：
 *   1. findDiagnosticPaths — 两类型节点间的诊断路径
 *   2. summarizeSubgraph — 指定节点的子图摘要
 *   3. getGraphDiff — 图状态差异
 *   4. findCrossDimensionalBrokers — 跨维桥接节点
 *   5. detectAnomalousPatterns — 异常模式检测
 */

import { createLogger } from '@synova/logger';

const log = createLogger('l4/diagnosis-graph-query');

interface GraphStoreLike {
  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{ id: string; type: string; props: Record<string, unknown> }>;
  queryEdges(type?: string, from?: string, to?: string, graph?: string): Array<{ id: string; type: string; from: string; to: string; weight: number; props: Record<string, unknown> }>;
}

export interface SubgraphSummary {
  nodeCount: number;
  edgeCount: number;
  typeDistribution: Record<string, number>;
  strongestConnections: Array<{ from: string; to: string; weight: number }>;
  anomalyScore: number;
}

export interface GraphDiff {
  nodesAdded: string[];
  nodesRemoved: string[];
  edgesAdded: string[];
  edgesRemoved: string[];
}

export interface BrokerNode {
  nodeId: string;
  betweennessScore: number;
}

export interface AnomalyPattern {
  type: string;
  severity: number;
  description: string;
}

// ═══ 1. findDiagnosticPaths ═══

export function findDiagnosticPaths(
  store: GraphStoreLike,
  graph: string,
  fromType: string,
  toType: string,
): string[][] {
  const fromNodes = store.queryNodes(fromType, undefined, graph);
  const toNodes = store.queryNodes(toType, undefined, graph);
  const results: string[][] = [];

  for (const fn of fromNodes) {
    for (const tn of toNodes) {
      if (fn.id === tn.id) continue;
      const edges = store.queryEdges(undefined, fn.id, tn.id, graph);
      if (edges.length > 0) {
        results.push([fn.id, tn.id]);
      }
    }
  }

  return results;
}

// ═══ 2. summarizeSubgraph ═══

export function summarizeSubgraph(
  store: GraphStoreLike,
  graph: string,
  rootId: string,
  maxDepth: number,
): SubgraphSummary {
  const visited = new Set<string>();
  const nodeTypes: Record<string, number> = {};
  const connections: Array<{ from: string; to: string; weight: number }> = [];

  function dfs(nodeId: string, depth: number): void {
    if (depth > maxDepth || visited.has(nodeId)) return;
    visited.add(nodeId);

    // Collect both outgoing and incoming edges
    const outEdges = store.queryEdges(undefined, nodeId, undefined, graph);
    const inEdges = store.queryEdges(undefined, undefined, nodeId, graph);
    const edges = [...outEdges, ...inEdges];
    for (const e of edges) {
      connections.push({ from: e.from, to: e.to, weight: e.weight });
      const neighborId = e.to === nodeId ? e.from : e.to;
      if (!visited.has(neighborId)) {
        const neighbors = store.queryNodes('', undefined, graph)
          .filter(n => n.id === neighborId);
        for (const n of neighbors) {
          nodeTypes[n.type] = (nodeTypes[n.type] || 0) + 1;
        }
        dfs(neighborId, depth + 1);
      }
    }
  }

  // Count root node type
  const rootNodes = store.queryNodes('', undefined, graph)
    .filter(n => n.id === rootId);
  for (const n of rootNodes) {
    nodeTypes[n.type] = (nodeTypes[n.type] || 0) + 1;
  }

  dfs(rootId, 0);

  const typeKeys = Object.keys(nodeTypes);
  const typeCount = typeKeys.length;
  const nodeCount = visited.size;
  const edgeCount = connections.length;

  // Anomaly score: low diversity (few types) = higher anomaly
  const anomalyScore = typeCount > 0
    ? Math.round((1 / typeCount) * 100) / 100
    : 1;

  const strongestConnections = [...connections]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5);

  return { nodeCount, edgeCount, typeDistribution: nodeTypes, strongestConnections, anomalyScore };
}

// ═══ 3. getGraphDiff ═══

export function getGraphDiff(
  store: GraphStoreLike,
  graph: string,
): GraphDiff {
  // Simplified diff: current state snapshot
  const nodes = store.queryNodes('', undefined, graph);
  const edges = store.queryEdges(undefined, undefined, undefined, graph);

  return {
    nodesAdded: nodes.map(n => n.id),
    nodesRemoved: [],
    edgesAdded: edges.map(e => e.id),
    edgesRemoved: [],
  };
}

// ═══ 4. findCrossDimensionalBrokers ═══

export function findCrossDimensionalBrokers(
  store: GraphStoreLike,
  graph: string,
): BrokerNode[] {
  // Use empty type to query all nodes (GraphStore treats '' as wildcard)
  const nodes = store.queryNodes('', undefined, graph);

  // Simplified betweenness: count all connections per node (in + out)
  const connectionCount = new Map<string, number>();
  for (const n of nodes) {
    const outEdges = store.queryEdges(undefined, n.id, undefined, graph);
    const inEdges = store.queryEdges(undefined, undefined, n.id, graph);
    connectionCount.set(n.id, outEdges.length + inEdges.length);
  }

  // Filter: at least 2 connections (hub criteria)
  const brokers: BrokerNode[] = [];
  for (const [nodeId, count] of connectionCount) {
    if (count >= 2) {
      brokers.push({ nodeId, betweennessScore: count / Math.max(...connectionCount.values()) });
    }
  }

  brokers.sort((a, b) => b.betweennessScore - a.betweennessScore);
  return brokers;
}

// ═══ 5. detectAnomalousPatterns ═══

export function detectAnomalousPatterns(
  store: GraphStoreLike,
  graph: string,
): AnomalyPattern[] {
  const anomalies: AnomalyPattern[] = [];
  const allNodes = store.queryNodes('', undefined, graph);
  const allEdges = store.queryEdges(undefined, undefined, undefined, graph);

  if (allNodes.length === 0) return [];

  // Detect isolated nodes
  const connectedNodes = new Set<string>();
  for (const e of allEdges) {
    connectedNodes.add(e.from);
    connectedNodes.add(e.to);
  }

  const isolatedCount = allNodes.filter(n => !connectedNodes.has(n.id)).length;
  if (isolatedCount > 0) {
    anomalies.push({
      type: 'isolated_nodes',
      severity: Math.round((isolatedCount / allNodes.length) * 100) / 100,
      description: `${isolatedCount} 个节点孤立 (${(isolatedCount / allNodes.length * 100).toFixed(0)}%)`,
    });
  }

  // Detect weight outliers: edges with weight 5x above median
  if (allEdges.length >= 3) {
    const sorted = allEdges.map(e => e.weight).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const threshold = Math.max(median * 5, 1);

    const outliers = allEdges.filter(e => e.weight > threshold);
    if (outliers.length > 0) {
      anomalies.push({
        type: 'weight_outliers',
        severity: Math.round((outliers.length / allEdges.length) * 100) / 100,
        description: `${outliers.length} 条边权重异常 (阈值 ${threshold.toFixed(1)})`,
      });
    }
  }

  log.info({ anomalies: anomalies.length }, '异常模式检测完成');
  return anomalies;
}

// ═══ 6. queryNodesCreatedAfter ═══

export function queryNodesCreatedAfter(
  store: GraphStoreLike,
  graph: string,
  days: number,
): number {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const nodes = store.queryNodes('', undefined, graph);
  const matched = nodes.filter(n => {
    const ca = n.props?.createdAt;
    return typeof ca === 'string' && ca >= cutoff;
  });
  log.info({ graph, days, matched: matched.length, total: nodes.length }, '增量查询完成');
  return matched.length;
}
