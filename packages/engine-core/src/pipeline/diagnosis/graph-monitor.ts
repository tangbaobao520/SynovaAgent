import { SOGNodeType, SOGEdgeType } from '@synova/sog-core';
/**
 * graph-monitor.ts — 实时异常检测引擎 (Phase B3)
 *
 * 对标 Claw-Code: continuous health monitoring + alerting.
 * 关键边的更新实时触发分析模块的增量计算。异常检测不再依赖月度诊断。
 */
import type { GraphStore } from './graph-store';
import type { EdgeType } from './types';
import { degreeCentrality } from './graph-query';

export interface GraphAlert {
  id: string;
  type: 'edge_weight_low' | 'centrality_shift' | 'edge_weight_drop';
  severity: 'critical' | 'high' | 'medium' | 'low';
  edgeType?: EdgeType;
  from?: string;
  to?: string;
  nodeId?: string;
  currentWeight?: number;
  threshold: number;
  message: string;
  timestamp: string;
}

export interface MonitorConfig {
  edgeTypes: EdgeType[];
  weightThreshold: number;
  centralityShiftThreshold: number;
}

/** 监控边权重——低于阈值触发告警 */
export function monitorEdgeWeight(
  store: GraphStore, edgeType: EdgeType,
  threshold: number, graph: string,
): GraphAlert[] {
  const alerts: GraphAlert[] = [];
  const edges = store.queryEdges(edgeType, undefined, undefined, graph);
  for (const e of edges) {
    if (e.weight < threshold) {
      alerts.push({
        id: `alert_${Date.now().toString(36)}_${Math.random() /* nosec: nonce for ID uniqueness */.toString(36).slice(2,6)}`,
        type: 'edge_weight_low',
        severity: e.weight < threshold * 0.5 ? 'high' : 'medium',
        edgeType, from: e.from, to: e.to, currentWeight: e.weight, threshold,
        message: `${edgeType} 边权重 ${e.weight.toFixed(2)} 低于阈值 ${threshold}`,
        timestamp: new Date().toISOString(),
      });
    }
  }
  return alerts;
}

/** 检测节点中心性突变——当前中心性与历史基准偏差超过阈值 */
export function detectCentralityShift(
  store: GraphStore, shiftThreshold: number, graph: string,
): GraphAlert[] {
  const alerts: GraphAlert[] = [];
  const persons = store.queryNodes(SOGNodeType.PERSON, undefined, graph);
  const agents = store.queryNodes(SOGNodeType.AGENT, undefined, graph);
  const allNodes = [...persons, ...agents];
  if (allNodes.length < 2) return [];

  const centralities = allNodes.map(n => ({ id: n.id, centrality: degreeCentrality(store, n.id, graph) }));
  const avg = centralities.reduce((s, c) => s + c.centrality, 0) / centralities.length;
  if (avg === 0) return [];

  for (const { id, centrality } of centralities) {
    const deviation = Math.abs(centrality - avg) / avg;
    if (deviation > shiftThreshold && centrality > 0) {
      alerts.push({
        id: `alert_${Date.now().toString(36)}_${Math.random() /* nosec: nonce for ID uniqueness */.toString(36).slice(2,6)}`,
        type: 'centrality_shift',
        severity: deviation > 2 ? 'critical' : deviation > 1.5 ? 'high' : 'medium',
        nodeId: id, currentWeight: centrality, threshold: shiftThreshold,
        message: `节点 ${id} 中心性偏离均值 ${(deviation*100).toFixed(0)}% (当前${centrality.toFixed(2)}, 均值${avg.toFixed(2)})`,
        timestamp: new Date().toISOString(),
      });
    }
  }
  return alerts;
}

/** 运行完整监控周期——合并所有告警 */
export function runMonitorTick(
  store: GraphStore, graph: string, config: MonitorConfig,
): GraphAlert[] {
  const alerts: GraphAlert[] = [];
  for (const edgeType of config.edgeTypes) {
    alerts.push(...monitorEdgeWeight(store, edgeType, config.weightThreshold, graph));
  }
  alerts.push(...detectCentralityShift(store, config.centralityShiftThreshold, graph));
  return alerts;
}
