/**
 * src/l4/graph-traversal.ts — 图遍历 (V4.3.0)
 *
 * 基于 GraphStore 原语的 BFS 图遍历工具。供 compute 函数迁移使用。
 *
 * 接口:
 *   traverse(startIds, edgeTypes)    — 从节点出发沿边 BFS 遍历
 *   getTemporalParams(nodeId)        — 获取节点的时序基线参数
 *   scanOutliers(type, threshold)    — 扫描某类节点的异常偏离
 *   evaluateEdges(nodeIds, edgeTypes) — 批量评估边状态
 */
import { createLogger } from '@synova/logger';
import type { GraphStore } from './graph-bridge';
import { computeTemporalBaseline } from './temporal-baseline';
import type { TemporalParams } from './temporal-baseline';

const log = createLogger('l4/graph-traversal');

// ═══ Types ═══

export interface TraversalResult {
  nodes: Array<{ id: string; type: string; props: Record<string, unknown> }>;
  edges: Array<{ id: string; type: string; from: string; to: string; weight: number; props: Record<string, unknown> }>;
  path: string[];
}

export interface EdgeEval {
  edgeId: string;
  edgeType: string;
  temporalParams: TemporalParams;
  anomalyScore: number;
}

export interface GraphTraversal {
  traverse(startNodeIds: string | string[], edgeTypes: string[]): TraversalResult;
  getTemporalParams(nodeId: string): TemporalParams;
  scanOutliers(resourcePoolType: string, sigmaThreshold: number): Array<{ id: string; type: string; props: Record<string, unknown> }>;
  evaluateEdges(nodeIds: string[], edgeTypes: string[]): EdgeEval[];
}

// ═══ Implementation ═══

export function createGraphTraversal(store: GraphStore): GraphTraversal {
  // ===== 1. traverse — BFS 遍历 =====
  function traverse(startNodeIds: string | string[], edgeTypes: string[]): TraversalResult {
    const ids = Array.isArray(startNodeIds) ? startNodeIds : [startNodeIds];
    const visited = new Set<string>();
    const resultNodes: Array<{ id: string; type: string; props: Record<string, unknown> }> = [];
    const resultEdges: Array<{ id: string; type: string; from: string; to: string; weight: number; props: Record<string, unknown> }> = [];
    const queue: Array<{ id: string; depth: number }> = ids.map(id => ({ id, depth: 0 }));

    try {
      while (queue.length > 0) {
        const { id, depth } = queue.shift()!;
        if (visited.has(id)) continue;
        visited.add(id);

        // 记录已访问节点（跳过起始节点）
        if (depth > 0) {
          const node = store.getNode(id, '');
          if (node && typeof node === 'object' && 'type' in (node as Record<string, unknown>)) {
            resultNodes.push(node as { id: string; type: string; props: Record<string, unknown> });
          }
        }

        // 最多到 1 步深度（防止全图遍历）
        if (depth >= 1) continue;

        // 从当前节点出去的所有边
        for (const edgeType of edgeTypes) {
          const edges = store.queryEdges(edgeType, id, undefined, '');
          for (const edge of edges) {
            resultEdges.push(edge);
            if (edge.to !== id && !visited.has(edge.to)) {
              queue.push({ id: edge.to, depth: depth + 1 });
            }
            if (edge.from !== id && !visited.has(edge.from)) {
              queue.push({ id: edge.from, depth: depth + 1 });
            }
          }
        }
      }
    } catch (err: unknown) {
      log.warn({ err, startNodeIds, edgeTypes }, 'traverse 失败 — 返回部分结果');
    }

    return { nodes: resultNodes, edges: resultEdges, path: Array.from(visited) };
  }

  // ===== 2. getTemporalParams — 节点时序基线 =====
  function getTemporalParams(nodeId: string): TemporalParams {
    try {
      const node = store.getNode(nodeId, '');
      if (!node) {
        return defaultTemporalParams();
      }

      // 从节点的 props 中提取数值字段，构造时序
      const props = (node as Record<string, unknown>).props as Record<string, unknown> || {};
      const values: number[] = [];

      // 尝试提取时序相关字段
      for (const key of Object.keys(props)) {
        const val = props[key];
        if (typeof val === 'number' && !key.startsWith('_')) {
          values.push(val);
        }
      }

      if (values.length === 0) {
        return defaultTemporalParams();
      }

      return computeTemporalBaseline(values);
    } catch (err: unknown) {
      log.warn({ err, nodeId }, 'getTemporalParams 失败 — 返回默认');
      return defaultTemporalParams();
    }
  }

  // ===== 3. scanOutliers — 异常节点扫描 =====
  function scanOutliers(
    resourcePoolType: string,
    sigmaThreshold: number
  ): Array<{ id: string; type: string; props: Record<string, unknown> }> {
    try {
      const nodes = store.queryNodes(resourcePoolType);
      if (nodes.length === 0) return [];

      // 提取每个节点的第一个数值字段作为基线值
      const values: number[] = [];
      for (const node of nodes) {
        const numVal = extractFirstNumeric(node.props);
        if (numVal !== null) values.push(numVal);
      }

      if (values.length === 0) return [];

      const mean = values.reduce((s, v) => s + v, 0) / values.length;
      const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
      const stdDev = Math.sqrt(variance);

      if (stdDev === 0) return [];

      // 找出偏离 > sigmaThreshold 的节点
      const outliers: Array<{ id: string; type: string; props: Record<string, unknown> }> = [];
      for (let i = 0; i < nodes.length; i++) {
        const numVal = extractFirstNumeric(nodes[i].props);
        if (numVal !== null && Math.abs(numVal - mean) > sigmaThreshold * stdDev) {
          outliers.push(nodes[i]);
        }
      }

      // 按偏离度排序，取前 10
      outliers.sort((a, b) => {
        const aVal = extractFirstNumeric(a.props) || 0;
        const bVal = extractFirstNumeric(b.props) || 0;
        return Math.abs(bVal - mean) - Math.abs(aVal - mean);
      });

      return outliers.slice(0, 10);
    } catch (err: unknown) {
      log.warn({ err, resourcePoolType }, 'scanOutliers 失败 — 返回空');
      return [];
    }
  }

  // ===== 4. evaluateEdges — 批量边评估 =====
  function evaluateEdges(nodeIds: string[], edgeTypes: string[]): EdgeEval[] {
    try {
      const results: EdgeEval[] = [];

      for (const nodeId of nodeIds) {
        for (const edgeType of edgeTypes) {
          const edges = store.queryEdges(edgeType, nodeId, undefined, '');
          for (const edge of edges) {
            const temporalParams = computeTemporalBaseline(
              extractNumericValues(edge.props)
            );
            const anomalyScore = Math.min(
              1,
              Math.abs(temporalParams.window_3m.slope) / 100
            );

            results.push({
              edgeId: edge.id,
              edgeType: edge.type,
              temporalParams,
              anomalyScore: Math.round(anomalyScore * 1000) / 1000,
            });
          }
        }
      }

      return results;
    } catch (err: unknown) {
      log.warn({ err, nodeIds, edgeTypes }, 'evaluateEdges 失败 — 返回空');
      return [];
    }
  }

  return { traverse, getTemporalParams, scanOutliers, evaluateEdges };
}

// ═══ Helpers ═══

function defaultTemporalParams(): TemporalParams {
  return {
    current: 0,
    window_3m: { mean: 0, slope: 0, variance: 0 },
    window_12m: { mean: 0, slope: 0, variance: 0 },
    trend: 'stable',
  };
}

function extractFirstNumeric(props: Record<string, unknown>): number | null {
  for (const val of Object.values(props)) {
    if (typeof val === 'number') return val;
  }
  return null;
}

function extractNumericValues(props: Record<string, unknown>): number[] {
  return Object.values(props).filter((v): v is number => typeof v === 'number');
}
