/**
 * src/ingest/data-pipeline-monitor.ts — D266 数据管道监控模块
 *
 * 权威17 §四.5: 检测数据管道是否在最近 N 天有新数据流入。
 * 封装 D263 queryNodesCreatedAfter() 为 PipelineHealth 接口。
 *
 * 契约:
 *   @input  — store + graph + days (默认 7)
 *   @output — PipelineHealth { nodesCreated7d, status }
 *   @degraded — status='degraded' 当 nodesCreated7d = 0
 */
import { queryNodesCreatedAfter } from '../l4/diagnosis-graph-query';
import type { GraphStoreLike } from '../l4/diagnosis-graph-query';

export interface PipelineHealth {
  nodesCreated7d: number;
  status: 'healthy' | 'degraded';
}

/**
 * 检测数据管道健康状态。
 * nodesCreated7d > 0 → healthy, = 0 → degraded。
 *
 * @param store — GraphStoreLike 实例
 * @param graph — 图谱名称 (默认 'default')
 * @param days  — 检测天数窗口 (默认 7)
 */
export function getPipelineHealth(
  store: GraphStoreLike,
  graph: string = 'default',
  days: number = 7,
): PipelineHealth {
  const count = queryNodesCreatedAfter(store, graph, days);
  return {
    nodesCreated7d: count,
    status: count > 0 ? 'healthy' : 'degraded',
  };
}
