/**
 * src/l4/graph-traversal.ts — 图遍历引擎
 *
 * 提供 BFS 遍历、异常节点扫描、边批量评估能力。
 * 使用 GraphStoreReader 接口进行图查询。
 *
 * V4.3.0 — 本体层重建: 图遍历思维替代 KV 读取
 */
import { createLogger } from '@synova/logger';

const log = createLogger('l4/graph-traversal');

export interface GraphStoreReader {
  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{ id: string; type: string; props: Record<string, unknown> }>;
  queryEdges(type?: string, from?: string, to?: string, graph?: string): Array<{ id: string; type: string; from: string; to: string; weight: number; props: Record<string, unknown> }>;
  getNode(id: string, graph: string): Record<string, unknown> | null;
}

export interface TraversalResult {
  nodes: Array<{ id: string; type: string; props: Record<string, unknown> }>;
  edges: Array<{ id: string; type: string; from: string; to: string; weight: number; props: Record<string, unknown> }>;
  path: string[];
  degraded: boolean;
  warnings: string[];
}

export interface TemporalParams {
  current: number;
  window_3m: { mean: number; slope: number; variance: number };
  window_12m: { mean: number; slope: number; variance: number };
  trend: 'accelerating' | 'decelerating' | 'stable' | 'reversing';
}

export interface EdgeEval {
  edgeId: string;
  edgeType: string;
  temporalParams: TemporalParams;
  anomalyScore: number;
}

export interface GraphTraversal {
  traverse(startNodeIds: string[], edgeTypes: string[], maxDepth?: number, graphOverride?: string): TraversalResult;
  getTemporalParams(edgeId: string): TemporalParams;
  scanOutliers(resourcePoolType: string, sigmaThreshold?: number): Array<{ id: string; type: string; props: Record<string, unknown>; deviation: number }>;
  evaluateEdges(nodeIds: string[], edgeTypes: string[]): EdgeEval[];
}

/**
 * 创建图遍历引擎。
 *
 * @param store - GraphStoreReader
 * @param graph - 绑定租户图（D338 fail-closed：调用方显式传入 org 作用域 graph；
 *                仅省略时回退 'default'，供既有 DSH 消费点（sentinel-loader）保持零行为变化）
 */
export function createGraphTraversal(store: GraphStoreReader, graph: string = 'default'): GraphTraversal {
  return {
    /**
     * BFS 遍历: 从 startNodeIds 出发，沿指定 edgeTypes 向外遍历。
     * 默认深度 1（一步），返回去重的节点和边。
     * graphOverride — 单次遍历覆盖绑定 graph（仍必须显式非空串）。
     */
    traverse(startNodeIds: string[], edgeTypes: string[], maxDepth: number = 1, graphOverride?: string): TraversalResult {
      const graphParam = graphOverride ?? graph;
      const visitedNodes = new Set<string>();
      const visitedEdges = new Set<string>();
      const warnings: string[] = [];
      const result: TraversalResult = { nodes: [], edges: [], path: [], degraded: false, warnings: [] };

      if (startNodeIds.length === 0) {
        warnings.push('No start node IDs provided');
        return { ...result, degraded: true, warnings };
      }

      if (edgeTypes.length === 0) {
        warnings.push('No edge types specified');
        return { ...result, degraded: true, warnings };
      }

      // 从起点开始 BFS
      const queue: Array<{ nodeId: string; depth: number }> = startNodeIds.map(id => ({ nodeId: id, depth: 0 }));
      for (const item of queue) visitedNodes.add(item.nodeId);

      while (queue.length > 0) {
        const current = queue.shift()!;
        if (current.depth >= maxDepth) continue;

        // 查找从当前节点出发的边
        try {
          const outEdges = store.queryEdges(undefined, current.nodeId, undefined, graphParam);
          for (const edge of outEdges) {
            if (!visitedEdges.has(edge.id) && edgeTypes.includes(edge.type)) {
              visitedEdges.add(edge.id);
              result.edges.push(edge);

              const targetNode = edge.to;
              if (!visitedNodes.has(targetNode)) {
                visitedNodes.add(targetNode);
                result.path.push(targetNode);
                // 读取目标节点
                const node = store.getNode(targetNode, graphParam);
                if (node) {
                  const nr = node as { type?: string; props?: Record<string, unknown> };
                  result.nodes.push({
                    id: targetNode,
                    type: nr.type || '',
                    props: nr.props || {},
                  });
                }
                queue.push({ nodeId: targetNode, depth: current.depth + 1 });
              }
            }
          }
        } catch (err: unknown) {
          log.warn({ err, nodeId: current.nodeId }, 'traverse: edge query failed for node');
          result.degraded = true;
          warnings.push(`Edge query failed for node ${current.nodeId}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      if (result.edges.length === 0 && result.nodes.length === 0) {
        result.degraded = true;
        warnings.push('Traversal completed with no results');
      }

      result.warnings = warnings;
      return result;
    },

    /**
     * 获取边的时序参数。
     * 对于不支持时序数据的 GraphStore，返回默认值。
     */
    getTemporalParams(_edgeId: string): TemporalParams {
      // 默认实现: 返回中性时序
      return {
        current: 0,
        window_3m: { mean: 0, slope: 0, variance: 0 },
        window_12m: { mean: 0, slope: 0, variance: 0 },
        trend: 'stable',
      };
    },

    /**
     * 扫描偏离基线的异常节点。
     * 对指定 resourcePoolType 的所有节点，计算其数值 props 偏离均值的 sigma 倍数。
     */
    scanOutliers(resourcePoolType: string, sigmaThreshold: number = 3): Array<{ id: string; type: string; props: Record<string, unknown>; deviation: number }> {
      const nodes = store.queryNodes(resourcePoolType, undefined, graph);
      if (nodes.length === 0) return [];

      // 收集所有数值字段
      const numericValues: Record<string, number[]> = {};
      for (const node of nodes) {
        for (const [key, val] of Object.entries(node.props)) {
          if (typeof val === 'number' || !isNaN(Number(val))) {
            if (!numericValues[key]) numericValues[key] = [];
            numericValues[key].push(Number(val));
          }
        }
      }

      // 计算每个字段的均值/标准差
      const stats: Record<string, { mean: number; std: number }> = {};
      for (const [key, vals] of Object.entries(numericValues)) {
        const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
        const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
        const std = Math.sqrt(variance);
        stats[key] = { mean, std: std || 1 };
      }

      // 计算每个节点的最大偏离
      const scored: Array<{ id: string; type: string; props: Record<string, unknown>; deviation: number }> = [];
      for (const node of nodes) {
        let maxDeviation = 0;
        for (const [key, val] of Object.entries(node.props)) {
          if (stats[key] && (typeof val === 'number' || !isNaN(Number(val)))) {
            const deviation = Math.abs((Number(val) - stats[key].mean) / stats[key].std);
            if (deviation > maxDeviation) maxDeviation = deviation;
          }
        }
        if (maxDeviation >= sigmaThreshold) {
          scored.push({
            id: node.id,
            type: node.type,
            props: node.props,
            deviation: Math.round(maxDeviation * 100) / 100,
          });
        }
      }

      // 按偏离度排序，返回前 10 个
      return scored.sort((a, b) => b.deviation - a.deviation).slice(0, 10);
    },

    /**
     * 批量边评估: 对指定节点周围的边做时序差分。
     */
    evaluateEdges(nodeIds: string[], edgeTypes: string[]): EdgeEval[] {
      const results: EdgeEval[] = [];

      for (const nodeId of nodeIds) {
        const traversal = this.traverse([nodeId], edgeTypes, 1);
        for (const edge of traversal.edges) {
          const params = this.getTemporalParams(edge.id);
          // 异常分数 = 基于趋势的简单评分
          let anomalyScore = 0;
          if (params.trend === 'decelerating' && params.window_3m.slope < 0) {
            anomalyScore = Math.min(Math.abs(params.window_3m.slope), 1);
          } else if (params.trend === 'accelerating' && params.window_3m.slope > 0) {
            anomalyScore = Math.min(params.window_3m.slope, 1);
          }

          results.push({
            edgeId: edge.id,
            edgeType: edge.type,
            temporalParams: params,
            anomalyScore: Math.round(anomalyScore * 100) / 100,
          });
        }
      }

      return results;
    },
  };
}
