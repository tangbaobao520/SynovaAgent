/**
 * graph-sse.ts — SSE 协议扩展 (Phase B4)
 *
 * ARCH-20: 前端图可视化 + 实时异常推送。
 * 新增 SSE 事件类型: graph_update, graph_action, insight_flash。
 */
import type { SubGraph } from './types';

export type InsightType = 'anomaly' | 'trend' | 'connection';
export type InsightSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

// ═══ SSE Event Builders ═══

/** 推送本体子图到前端 */
export function buildGraphUpdateEvent(subGraph: SubGraph, highlights: string[] = []): string {
  const payload = { nodes: subGraph.nodes, edges: subGraph.edges, highlights, timestamp: new Date().toISOString() };
  return `event: graph_update\ndata: ${JSON.stringify(payload)}\n\n`;
}

/** 实时推送异常发现 */
export function buildInsightFlash(
  type: InsightType, message: string,
  severity: InsightSeverity, nodeIds: string[] = [],
): string {
  const payload = { type, message, severity, nodeIds, timestamp: new Date().toISOString() };
  return `event: insight_flash\ndata: ${JSON.stringify(payload)}\n\n`;
}

/** 用户在图上的操作回传给引擎（前端→后端） */
export function buildGraphActionEvent(
  action: 'connect' | 'disconnect' | 'mark' | 'delete',
  payload: Record<string, unknown>,
): string {
  const data = { action, ...payload, timestamp: new Date().toISOString() };
  return `event: graph_action\ndata: ${JSON.stringify(data)}\n\n`;
}

// ═══ Batch Encoder ═══

export class GraphSSEEncoder {
  private events: string[] = [];

  addGraphUpdate(subGraph: SubGraph, highlights: string[] = []): this {
    this.events.push(buildGraphUpdateEvent(subGraph, highlights));
    return this;
  }

  addInsightFlash(type: InsightType, message: string, severity: InsightSeverity, nodeIds: string[] = []): this {
    this.events.push(buildInsightFlash(type, message, severity, nodeIds));
    return this;
  }

  addGraphAction(action: 'connect' | 'disconnect' | 'mark' | 'delete', payload: Record<string, unknown>): this {
    this.events.push(buildGraphActionEvent(action, payload));
    return this;
  }

  encode(): string {
    return this.events.join('');
  }

  clear(): void {
    this.events.length = 0;
  }
}
