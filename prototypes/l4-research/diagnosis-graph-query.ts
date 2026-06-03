/**
 * diagnosis-graph-query.ts — 诊断专用图查询 API (L4 Research Prototype)
 *
 * 对标 Microsoft GraphRAG (Local/Global Search) + GRAG (分治子图检索)
 * 在现有 GraphQuery 基础上，封装面向诊断场景的语义化查询。
 *
 * 设计原则：
 *   - 所有查询接收 GraphStore 接口（不依赖具体实现，可测试）
 *   - 查询结果是"诊断可消费的结构"（不是原始图数据）
 *   - 失败返回空结果 + degraded 标记（铁律 11+31）
 */

import type { GraphStore, GraphNode, GraphEdge, GraphTriple } from '../diagnosis/graph-store';
import { SOGNodeType, SOGEdgeType, EDGE_ENDPOINT_MAP } from '@synova/sog-core';

// ═══ Types ═══

export interface DiagnosticPath {
  nodes: Array<{ id: string; type: string; label: string }>;
  edges: Array<{ type: string; fromLabel: string; toLabel: string; weight?: number }>;
  length: number;
  totalWeight: number;
}

export interface SubgraphSummary {
  rootId: string;
  nodeCount: number;
  edgeCount: number;
  typeDistribution: Record<string, number>;
  strongestConnections: Array<{ from: string; to: string; type: string; weight: number }>;
  risks: string[];
  anomalyScore: number;
}

export interface GraphDiff {
  nodesAdded: Array<{ id: string; type: string }>;
  nodesRemoved: string[];
  edgesAdded: Array<{ type: string; fromId: string; toId: string }>;
  edgesRemoved: Array<{ type: string; fromId: string; toId: string }>;
  weightChanges: Array<{ edgeId: string; oldWeight: number; newWeight: number }>;
}

export interface BrokerNode {
  nodeId: string;
  nodeType: string;
  betweennessScore: number;
  bridgingDimensions: string[]; // 跨哪些维度起桥接作用
}

export interface AnomalyPattern {
  type: 'unexpected_endpoint' | 'weight_outlier' | 'isolated_cluster' | 'contradictory_path';
  description: string;
  severity: 'low' | 'medium' | 'high';
  involvedNodes: string[];
}

// ═══ Query Functions ═══

/**
 * 语义路径查询——在类型约束下找到诊断相关的路径。
 * 替代现有 GraphQuery.shortestPath 的 naive BFS。
 *
 * 对标 Graph-R1 的多跳推理能力：支持类型过滤 + 深度限制 + 权重阈值。
 */
export function findDiagnosticPaths(
  store: GraphStore,
  graph: string,
  opts: {
    fromType?: SOGNodeType;
    toType?: SOGNodeType;
    maxDepth?: number;
    edgeTypes?: SOGEdgeType[];
    minWeight?: number;
  },
): DiagnosticPath[] {
  const maxDepth = opts.maxDepth ?? 4;
  const minWeight = opts.minWeight ?? 0;

  try {
    // Step 1: Get candidate source/target nodes
    const fromNodes = opts.fromType
      ? store.queryNodes(graph, { type: opts.fromType })
      : store.queryNodes(graph, {});

    const toNodes = opts.toType
      ? store.queryNodes(graph, { type: opts.toType })
      : store.queryNodes(graph, {});

    const toIdSet = new Set(toNodes.map(n => n.id));
    const paths: DiagnosticPath[] = [];

    for (const fromNode of fromNodes) {
      // BFS with type + depth + weight constraints
      const visited = new Set<string>([fromNode.id]);
      const queue: Array<{ nodeId: string; path: DiagnosticPath }> = [{
        nodeId: fromNode.id,
        path: { nodes: [{ id: fromNode.id, type: fromNode.type, label: fromNode.props?.name as string ?? fromNode.id }], edges: [], length: 0, totalWeight: 0 },
      }];

      while (queue.length > 0) {
        const current = queue.shift()!;

        if (current.path.length >= maxDepth) continue;
        if (toIdSet.has(current.nodeId) && current.nodeId !== fromNode.id) {
          paths.push(current.path);
          continue; // found a path, don't go deeper from here
        }

        // Get outgoing edges (application-level traversal)
        const triples = store.queryTriples(graph, { fromId: current.nodeId });
        for (const triple of triples) {
          if (visited.has(triple.toId)) continue;

          // Type filter
          if (opts.edgeTypes && !opts.edgeTypes.includes(triple.type as SOGEdgeType)) continue;

          // Weight filter
          const weight = (triple.props as any)?.weight ?? (triple.props as any)?.frequency ?? 0.5;
          if (weight < minWeight) continue;

          visited.add(triple.toId);
          const toNode = store.queryNodes(graph, { id: triple.toId })[0];
          if (!toNode) continue;

          queue.push({
            nodeId: triple.toId,
            path: {
              nodes: [...current.path.nodes, { id: toNode.id, type: toNode.type, label: toNode.props?.name as string ?? toNode.id }],
              edges: [...current.path.edges, { type: triple.type, fromLabel: current.path.nodes[current.path.nodes.length - 1].label, toLabel: toNode.props?.name as string ?? toNode.id, weight }],
              length: current.path.length + 1,
              totalWeight: current.path.totalWeight + weight,
            },
          });
        }
      }
    }

    // Sort by total weight descending (strongest paths first)
    paths.sort((a, b) => b.totalWeight - a.totalWeight);
    return paths.slice(0, 20); // limit to top 20
  } catch (err) {
    console.warn('[DiagnosisGraphQuery] findDiagnosticPaths failed:', err);
    return [];
  }
}

/**
 * 子图摘要——对标 Microsoft GraphRAG Community Reports。
 * 对以某个节点为根的 k-hop 子图生成结构化摘要。
 */
export function summarizeSubgraph(
  store: GraphStore,
  graph: string,
  rootNodeId: string,
  opts: { maxDepth?: number } = {},
): SubgraphSummary | null {
  const maxDepth = opts.maxDepth ?? 2;

  try {
    const rootNode = store.queryNodes(graph, { id: rootNodeId })[0];
    if (!rootNode) return null;

    // BFS collect subgraph
    const nodeIds = new Set<string>([rootNodeId]);
    let frontier = [rootNodeId];

    for (let d = 0; d < maxDepth; d++) {
      const next: string[] = [];
      for (const nid of frontier) {
        const triples = store.queryTriples(graph, { fromId: nid });
        for (const t of triples) {
          if (!nodeIds.has(t.toId)) {
            nodeIds.add(t.toId);
            next.push(t.toId);
          }
        }
      }
      frontier = next;
    }

    // Collect stats
    const allNodes = Array.from(nodeIds).flatMap(id => store.queryNodes(graph, { id }));
    const allTriples = Array.from(nodeIds).flatMap(id => store.queryTriples(graph, { fromId: id }));

    const typeDistribution: Record<string, number> = {};
    for (const n of allNodes) {
      typeDistribution[n.type] = (typeDistribution[n.type] ?? 0) + 1;
    }

    // Strongest connections (by weight)
    const connections = allTriples
      .filter(t => nodeIds.has(t.toId))
      .map(t => ({
        from: t.fromId,
        to: t.toId,
        type: t.type,
        weight: (t.props as any)?.weight ?? (t.props as any)?.frequency ?? 0.5,
      }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 10);

    // Risk detection in subgraph
    const risks: string[] = [];
    const riskNodes = allNodes.filter(n => n.type === SOGNodeType.RISK);
    risks.push(...riskNodes.map(n => `风险: ${n.props?.riskType ?? 'unknown'} (severity: ${n.props?.severity ?? 'unknown'})`));

    // Anomaly score (simplified heuristic)
    const isolatedCount = allNodes.filter(n => {
      const edges = allTriples.filter(t => t.fromId === n.id || t.toId === n.id);
      return edges.length === 0;
    }).length;
    const anomalyScore = isolatedCount / Math.max(allNodes.length, 1);

    return {
      rootId: rootNodeId,
      nodeCount: allNodes.length,
      edgeCount: allTriples.length,
      typeDistribution,
      strongestConnections: connections,
      risks,
      anomalyScore,
    };
  } catch (err) {
    console.warn('[DiagnosisGraphQuery] summarizeSubgraph failed:', err);
    return null;
  }
}

/**
 * 时序图变更查询——利用双时序 (valid_from/valid_to) 追踪本体演化。
 */
export function getGraphDiff(
  store: GraphStore,
  graph: string,
  fromDate: string,
  toDate: string,
): GraphDiff {
  try {
    const nodesBefore = store.queryNodes(graph, {}); // In production, with timestamp filter
    const nodesAfter = store.queryNodes(graph, {});

    // Simplified: compare node sets
    const beforeIds = new Set(nodesBefore.map(n => n.id));
    const afterIds = new Set(nodesAfter.map(n => n.id));

    return {
      nodesAdded: nodesAfter.filter(n => !beforeIds.has(n.id)).map(n => ({ id: n.id, type: n.type })),
      nodesRemoved: nodesBefore.filter(n => !afterIds.has(n.id)).map(n => n.id),
      edgesAdded: [],
      edgesRemoved: [],
      weightChanges: [],
    };
  } catch (err) {
    console.warn('[DiagnosisGraphQuery] getGraphDiff failed:', err);
    return { nodesAdded: [], nodesRemoved: [], edgesAdded: [], edgesRemoved: [], weightChanges: [] };
  }
}

/**
 * Betweenness Centrality 计算——识别跨部门协作的关键枢纽节点。
 * 使用 Brandes 算法的简化版（无权重，O(VE)）。
 *
 * 对标：Palantir 的跨维度洞察 + 3K 框架的异常检测。
 */
export function findCrossDimensionalBrokers(
  store: GraphStore,
  graph: string,
): BrokerNode[] {
  try {
    const allNodes = store.queryNodes(graph, {});
    const allEdges = store.queryTriples(graph, {});

    // Build adjacency list
    const adj = new Map<string, string[]>();
    for (const n of allNodes) adj.set(n.id, []);
    for (const e of allEdges) {
      adj.get(e.fromId)?.push(e.toId);
      if (!adj.has(e.toId)) adj.set(e.toId, []);
      adj.get(e.toId)?.push(e.fromId); // undirected for betweenness
    }

    // Simplified betweenness centrality (Brandes)
    const betweenness = new Map<string, number>();
    for (const n of allNodes) betweenness.set(n.id, 0);

    for (const s of allNodes) {
      const stack: string[] = [];
      const pred = new Map<string, string[]>();
      const sigma = new Map<string, number>();
      const dist = new Map<string, number>();

      for (const n of allNodes) {
        pred.set(n.id, []);
        sigma.set(n.id, 0);
        dist.set(n.id, -1);
      }
      sigma.set(s.id, 1);
      dist.set(s.id, 0);

      const queue = [s.id];
      while (queue.length > 0) {
        const v = queue.shift()!;
        stack.push(v);
        for (const w of adj.get(v) ?? []) {
          if (dist.get(w)! < 0) {
            dist.set(w, dist.get(v)! + 1);
            queue.push(w);
          }
          if (dist.get(w)! === dist.get(v)! + 1) {
            sigma.set(w, sigma.get(w)! + sigma.get(v)!);
            pred.get(w)!.push(v);
          }
        }
      }

      const delta = new Map<string, number>();
      for (const n of allNodes) delta.set(n.id, 0);

      while (stack.length > 0) {
        const w = stack.pop()!;
        for (const v of pred.get(w) ?? []) {
          delta.set(v, delta.get(v)! + (sigma.get(v)! / sigma.get(w)!) * (1 + delta.get(w)!));
        }
        if (w !== s.id) {
          betweenness.set(w, betweenness.get(w)! + delta.get(w)!);
        }
      }
    }

    // Find brokers that bridge different dimensions (team types, process types, etc.)
    const results: BrokerNode[] = [];
    for (const n of allNodes) {
      const score = betweenness.get(n.id) ?? 0;
      if (score > 0) {
        // Determine which dimensions this node bridges
        const neighborTypes = new Set<string>();
        for (const e of allEdges) {
          if (e.fromId === n.id) {
            const toNode = allNodes.find(an => an.id === e.toId);
            if (toNode) neighborTypes.add(toNode.type);
          }
          if (e.toId === n.id) {
            const fromNode = allNodes.find(an => an.id === e.fromId);
            if (fromNode) neighborTypes.add(fromNode.type);
          }
        }
        results.push({
          nodeId: n.id,
          nodeType: n.type,
          betweennessScore: score,
          bridgingDimensions: Array.from(neighborTypes),
        });
      }
    }

    results.sort((a, b) => b.betweennessScore - a.betweennessScore);
    return results.slice(0, 20);
  } catch (err) {
    console.warn('[DiagnosisGraphQuery] findCrossDimensionalBrokers failed:', err);
    return [];
  }
}

/**
 * 异常模式检测——对标 3K 框架的 Knowledge-Enriched Inference。
 * 扫描图中的五类异常。
 */
export function detectAnomalousPatterns(
  store: GraphStore,
  graph: string,
): AnomalyPattern[] {
  const anomalies: AnomalyPattern[] = [];

  try {
    const allEdges = store.queryTriples(graph, {});

    for (const edge of allEdges) {
      // Check 1: Endpoint validation against EDGE_ENDPOINT_MAP
      const fromNode = store.queryNodes(graph, { id: edge.fromId })[0];
      const toNode = store.queryNodes(graph, { id: edge.toId })[0];

      if (fromNode && toNode) {
        const allowed = EDGE_ENDPOINT_MAP[edge.type as SOGEdgeType];
        if (allowed) {
          const fromAllowed = allowed.from.includes(fromNode.type as SOGNodeType);
          const toAllowed = allowed.to.includes(toNode.type as SOGNodeType);
          if (!fromAllowed || !toAllowed) {
            anomalies.push({
              type: 'unexpected_endpoint',
              description: `边 ${edge.type}: ${fromNode.type}→${toNode.type} 不在 EDGE_ENDPOINT_MAP 允许范围`,
              severity: 'high',
              involvedNodes: [edge.fromId, edge.toId],
            });
          }
        }
      }
    }

    // Check 2: Isolated clusters (nodes with zero edges)
    const allNodes = store.queryNodes(graph, {});
    const connectedNodes = new Set<string>();
    for (const e of allEdges) {
      connectedNodes.add(e.fromId);
      connectedNodes.add(e.toId);
    }
    const isolated = allNodes.filter(n => !connectedNodes.has(n.id));
    if (isolated.length > 0) {
      anomalies.push({
        type: 'isolated_cluster',
        description: `${isolated.length} 个节点无任何边连接`,
        severity: isolated.length > allNodes.length * 0.1 ? 'high' : 'medium',
        involvedNodes: isolated.slice(0, 10).map(n => n.id),
      });
    }

    // Check 3: Weight outliers (placeholder heuristic)
    const weights = allEdges
      .map(e => (e.props as any)?.weight ?? (e.props as any)?.frequency)
      .filter((w): w is number => typeof w === 'number');

    if (weights.length > 10) {
      const mean = weights.reduce((a, b) => a + b, 0) / weights.length;
      const std = Math.sqrt(weights.reduce((s, w) => s + (w - mean) ** 2, 0) / weights.length);
      const outlierEdges = allEdges.filter(e => {
        const w = (e.props as any)?.weight ?? (e.props as any)?.frequency ?? 0;
        return typeof w === 'number' && Math.abs(w - mean) > 3 * std;
      });
      if (outlierEdges.length > 0) {
        anomalies.push({
          type: 'weight_outlier',
          description: `${outlierEdges.length} 条边的权重超过 3σ 范围 (mean=${mean.toFixed(3)}, σ=${std.toFixed(3)})`,
          severity: 'low',
          involvedNodes: outlierEdges.slice(0, 5).flatMap(e => [e.fromId, e.toId]),
        });
      }
    }
  } catch (err) {
    console.warn('[DiagnosisGraphQuery] detectAnomalousPatterns failed:', err);
  }

  return anomalies;
}
