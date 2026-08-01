/**
 * l5/ontology-event-bus.ts — L5 进程内事件总线
 *
 * 替代 NATS JetStream 用于单容器部署。
 * 保留发布/消费/DLQ/健康检查架构，不引入外部依赖。
 * engine-core 的 NatsOntologyPublisher/Consumer 接口在此得到完整实现。
 */
import { createLogger } from '@synova/logger';
import type { GraphStore } from '../l4/graph-bridge';

const log = createLogger('l5/event-bus');

// ═══ Types ═══

export interface OntologyEvent {
  type: 'node_created' | 'edge_created' | 'graph_sync_complete';
  nodeType?: string;
  edgeType?: string;
  from?: string;
  to?: string;
  weight?: number;
  props?: Record<string, unknown>;
  graph: string;
  nodeCount?: number;
  edgeCount?: number;
  timestamp: string;
}

interface DeadLetterEntry {
  event: OntologyEvent;
  attempts: number;
  lastError: string;
  failedAt: string;
}

// ═══ EventBus ═══

export class OntologyEventBus {
  private graphStore: GraphStore;
  private deadLetterQueue: DeadLetterEntry[] = [];
  private metrics = {
    published: 0, consumed: 0, failed: 0, deadLettered: 0,
  };

  constructor(graphStore: GraphStore) {
    this.graphStore = graphStore;
  }

  /** Publish an ontology event (in-process, no NATS) */
  async publish(event: OntologyEvent): Promise<void> {
    this.metrics.published++;
    try {
      await this.consume(event);
      this.metrics.consumed++;
    } catch (err: any) {
      this.metrics.failed++;
      log.warn({ err, eventType: event.type }, '事件消费失败');
      this.deadLetter(event, err.message);
    }
  }

  /** Batch publish */
  async batchPublish(events: OntologyEvent[]): Promise<void> {
    for (const ev of events) await this.publish(ev);
    log.info({ count: events.length }, '批量事件已发布');
  }

  /** Consume: write event to GraphStore */
  private async consume(event: OntologyEvent): Promise<void> {
    switch (event.type) {
      case 'node_created':
        if (event.nodeType && event.props) {
          this.graphStore.createNode(event.nodeType, event.props, event.graph);
        }
        break;
      case 'edge_created':
        if (event.edgeType && event.from && event.to) {
          this.graphStore.createEdge(event.edgeType, event.from, event.to, event.weight || 1.0, event.props || {}, event.graph);
        }
        break;
      case 'graph_sync_complete':
        log.info({ graph: event.graph, nodes: event.nodeCount, edges: event.edgeCount }, '图同步完成');
        break;
    }
  }

  /** Dead letter: store failed events for retry */
  private deadLetter(event: OntologyEvent, error: string): void {
    if (this.deadLetterQueue.length >= 1000) this.deadLetterQueue.shift();
    this.deadLetterQueue.push({
      event, attempts: 1, lastError: error,
      failedAt: new Date().toISOString(),
    });
    this.metrics.deadLettered++;
  }

  /** Retry a dead-lettered event */
  retryDeadLetter(index: number): boolean {
    if (index < 0 || index >= this.deadLetterQueue.length) return false;
    const entry = this.deadLetterQueue.splice(index, 1)[0];
    entry.attempts++;
    this.publish(entry.event).catch((err) => {
      log.warn({ err }, '事件重发失败 — 已从死信队列移除');
    });
    return true;
  }

  /** Health check */
  health(): { status: 'healthy' | 'degraded' | 'unhealthy'; metrics: { published: number; consumed: number; failed: number; deadLettered: number }; dlqSize: number } {
    const failureRate = this.metrics.failed / Math.max(this.metrics.published, 1);
    if (failureRate > 0.5) return { status: 'unhealthy', metrics: { ...this.metrics }, dlqSize: this.deadLetterQueue.length };
    if (failureRate > 0.1) return { status: 'degraded', metrics: { ...this.metrics }, dlqSize: this.deadLetterQueue.length };
    return { status: 'healthy', metrics: { ...this.metrics }, dlqSize: this.deadLetterQueue.length };
  }

  getMetrics() { return { ...this.metrics }; }
  getDeadLetterQueue() { return [...this.deadLetterQueue]; }
}

// Singleton
let _bus: OntologyEventBus | null = null;

export function getOntologyEventBus(store?: GraphStore): OntologyEventBus {
  if (!_bus && store) _bus = new OntologyEventBus(store);
  if (!_bus) throw new Error('OntologyEventBus 未初始化');
  return _bus;
}
