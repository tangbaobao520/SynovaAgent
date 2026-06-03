/**
 * orchestrator/types.ts — 编排层类型定义 (Iter 1)
 *
 * 所有状态变更 = 事件。事件日志是不可变的唯一真相。
 */
export interface OrchestrationEvent {
  id: string;
  type: string;
  consultationId: string;
  phase?: number;
  data: Record<string, unknown>;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  timestamp: string;
}

export interface EventFilter {
  consultationId?: string;
  type?: string;
  phase?: number;
  fromTimestamp?: string;
  limit?: number;
}
