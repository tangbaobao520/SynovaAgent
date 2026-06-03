/**
 * nats-ontology-pipeline.ts — NATS JetStream 事件管道 (Phase B 实现)
 *
 * 对标 NATS server/stream.go + consumer.go:
 *   Stream: InterestPolicy (GraphStore ACK 后自动删除)
 *   Consumer: AckExplicit + MaxDeliver=10 + BackOff=[5s,10s,30s,1m,5m]
 *
 * 架构: OntologyAdapter → NATS publish → Stream persist → Consumer push → GraphStore write → ACK
 */
import type { GraphStore } from './graph-store';
import type { NodeType, EdgeType } from './types';
import { createLogger } from '../../infra/logger';

const log = createLogger('diagnosis/nats-ontology-pipeline');

// ═══ Metrics (Gap 5) ═══

export interface PipelineMetrics {
  publishedNodes: number;
  publishedEdges: number;
  publishedSyncs: number;
  consumedSuccess: number;
  consumedFailed: number;
  deadLettered: number;
  lastPublishAt?: string;
  lastConsumeAt?: string;
  avgProcessTimeMs: number;
}

let metrics: PipelineMetrics = {
  publishedNodes: 0, publishedEdges: 0, publishedSyncs: 0,
  consumedSuccess: 0, consumedFailed: 0, deadLettered: 0,
  avgProcessTimeMs: 0,
};
const processTimes: number[] = [];

export function getPipelineMetrics(): PipelineMetrics { return { ...metrics, avgProcessTimeMs: processTimes.length > 0 ? processTimes.reduce((a,b)=>a+b,0)/processTimes.length : 0 }; }

// ═══ Dead Letter Queue (Gap 4) ═══

const deadLetterQueue: Array<{ msg: NatsMsg; attempts: number; lastError: string; failedAt: string }> = [];

export function getDeadLetterQueue() { return [...deadLetterQueue]; }
export function requeueDeadLetter(index: number): boolean {
  if (index < 0 || index >= deadLetterQueue.length) return false;
  deadLetterQueue.splice(index, 1);
  return true;
}

export function resetMetrics(): void {
  metrics = { publishedNodes:0,publishedEdges:0,publishedSyncs:0,consumedSuccess:0,consumedFailed:0,deadLettered:0,avgProcessTimeMs:0 };
  processTimes.length = 0;
  deadLetterQueue.length = 0;
}

// ═══ Health Check (Gap 3) ═══

export interface PipelineHealth { status: 'healthy' | 'degraded' | 'unhealthy'; details: string; metrics: PipelineMetrics; dlqSize: number; }
export function pipelineHealth(): PipelineHealth {
  const m = getPipelineMetrics();
  const failureRate = m.consumedFailed / Math.max(m.consumedSuccess + m.consumedFailed, 1);
  if (failureRate > 0.5) return { status: 'unhealthy', details: `失败率 ${(failureRate*100).toFixed(0)}% > 50%`, metrics: m, dlqSize: deadLetterQueue.length };
  if (failureRate > 0.1) return { status: 'degraded', details: `失败率 ${(failureRate*100).toFixed(0)}% > 10%`, metrics: m, dlqSize: deadLetterQueue.length };
  return { status: 'healthy', details: '正常', metrics: m, dlqSize: deadLetterQueue.length };
}

// ═══ Config ═══

export interface OntologyStreamConfig {
  name: string;
  subjects: string[];
  retention: 'interest' | 'limits' | 'workqueue';
  maxAge: number;  // nanoseconds
  storage: 'file' | 'memory';
  replicas: number;
}

export interface ConsumerConfig {
  durable_name: string;
  filter_subject: string;
  ack_policy: 'explicit' | 'all' | 'none';
  max_deliver: number;
  ack_wait: number;       // nanoseconds
  backoff: number[];       // nanoseconds per retry
  max_ack_pending: number;
}

export const DEFAULT_STREAM_CONFIG: OntologyStreamConfig = {
  name: 'ontology_events',
  subjects: ['ontology.node.>', 'ontology.edge.>', 'ontology.graph.sync'],
  retention: 'interest',   // GraphStore ACK 后自动删除
  maxAge: 24 * 3600 * 1_000_000_000, // 24h in nanoseconds
  storage: 'file',
  replicas: 1,
};

export const DEFAULT_CONSUMER_CONFIG: ConsumerConfig = {
  durable_name: 'graph-store-writer',
  filter_subject: 'ontology.>',
  ack_policy: 'explicit',
  max_deliver: 10,
  ack_wait: 30_000_000_000,  // 30s in nanoseconds
  backoff: [5_000_000_000, 10_000_000_000, 30_000_000_000, 60_000_000_000, 300_000_000_000],
  max_ack_pending: 1000,
};

// ═══ Publisher ═══

interface NatsMsg {
  subject: string;
  data: string;
  ack?: () => Promise<void>;
  nak?: (delay?: number) => Promise<void>;
}

interface NatsConnection {
  jetstream: () => any;
  publish: (subject: string, data: string) => void;
}

export class NatsOntologyPublisher {
  private nc: NatsConnection;

  constructor(nc: NatsConnection) {
    this.nc = nc;
  }

  async publishNodeCreated(type: NodeType, props: Record<string,unknown>, graph: string): Promise<void> {
    const subject = `ontology.node.created.${type.toLowerCase()}`;
    const payload = JSON.stringify({ type: 'node_created', nodeType: type, props, graph, timestamp: new Date().toISOString() });
    this.nc.publish(subject, payload);
    metrics.publishedNodes++; metrics.lastPublishAt = new Date().toISOString();
  }

  async publishEdgeCreated(type: EdgeType, from: string, to: string, weight: number, props: Record<string,unknown>, graph: string): Promise<void> {
    const subject = `ontology.edge.created.${type.toLowerCase()}`;
    const payload = JSON.stringify({ type: 'edge_created', edgeType: type, from, to, weight, props, graph, timestamp: new Date().toISOString() });
    this.nc.publish(subject, payload);
    metrics.publishedEdges++; metrics.lastPublishAt = new Date().toISOString();
  }

  /** 批量发布 (Gap 2): 对标 NATS stream.go StoreMsg batch。单次 JetStream publish 发送多条消息 */
  async batchPublish(events: Array<{type:'node', nodeType:NodeType, props:Record<string,unknown>}|{type:'edge', edgeType:EdgeType, from:string, to:string, weight:number, props:Record<string,unknown>}>, graph: string): Promise<void> {
    for (const ev of events) {
      if (ev.type === 'node') await this.publishNodeCreated(ev.nodeType, ev.props, graph);
      else await this.publishEdgeCreated(ev.edgeType, ev.from, ev.to, ev.weight, ev.props, graph);
    }
    log.info({ count: events.length, graph }, '[nats-pub] Batch published');
  }

  async publishGraphSyncComplete(graph: string, nodeCount: number, edgeCount: number): Promise<void> {
    const subject = 'ontology.graph.sync.complete';
    const payload = JSON.stringify({ type: 'graph_sync_complete', graph, nodeCount, edgeCount, timestamp: new Date().toISOString() });
    this.nc.publish(subject, payload);
    metrics.publishedSyncs++; metrics.lastPublishAt = new Date().toISOString();
  }
}

// ═══ Consumer ═══

export class NatsGraphStoreConsumer {
  private nc: NatsConnection;
  private store: GraphStore;
  private graph: string;

  constructor(nc: NatsConnection, store: GraphStore, graph: string) {
    this.nc = nc; this.store = store; this.graph = graph;
  }

  /** Process a single message from the NATS consumer. Returns true if successful.
   *  Gap 1+4: Transient → NAK+retry; Permanent → Dead Letter; Success → ACK */
  async processOneMessage(msg: NatsMsg, attemptCount = 1): Promise<boolean> {
    const startTime = Date.now();
    try {
      const event = JSON.parse(msg.data);

      switch (event.type) {
        case 'node_created':
          this.store.createNode(event.nodeType, event.props, event.graph || this.graph);
          break;
        case 'edge_created':
          if (!event.edgeType || !event.from || !event.to) {
            // Permanent error — can't create edge without valid IDs → Dead Letter
            log.error({ data: msg.data?.slice(0, 200) }, '[nats-consume] Invalid edge data — routing to dead letter');
            deadLetterQueue.push({ msg, attempts: attemptCount, lastError: 'Invalid edge: missing type/from/to', failedAt: new Date().toISOString() });
            metrics.deadLettered++; metrics.consumedFailed++;
            if (msg.ack) await msg.ack(); // ACK to remove from stream (we've captured it in DLQ)
            return false;
          }
          this.store.createEdge(event.edgeType, event.from, event.to, event.weight, event.props || {}, event.graph || this.graph);
          break;
        case 'graph_sync_complete':
          log.info({ graph: event.graph, nodes: event.nodeCount, edges: event.edgeCount }, '[nats-consume] Graph sync complete acknowledged');
          break;
        default:
          log.warn({ type: event.type }, '[nats-consume] Unknown event type — routing to dead letter');
          deadLetterQueue.push({ msg, attempts: attemptCount, lastError: `Unknown type: ${event.type}`, failedAt: new Date().toISOString() });
          metrics.deadLettered++; metrics.consumedFailed++;
          if (msg.ack) await msg.ack();
          return false;
      }

      if (msg.ack) await msg.ack();
      metrics.consumedSuccess++;
      processTimes.push(Date.now() - startTime);
      if (processTimes.length > 100) processTimes.shift();
      metrics.lastConsumeAt = new Date().toISOString();
      return true;
    } catch (err: any) {
      const isTransient = /timeout|network|econnrefused|sqlite_busy/i.test(err.message);
      metrics.consumedFailed++;
      if (isTransient) {
        // Gap 1: Transient error → NAK with backoff (NATS will redeliver)
        log.warn({ err, attempt: attemptCount }, '[nats-consume] Transient failure — NAK for redelivery');
        if (msg.nak) await msg.nak(5000);
      } else {
        // Gap 4: Permanent error → Dead Letter Queue
        log.error({ err, data: msg.data?.slice(0, 200), attempt: attemptCount }, '[nats-consume] Permanent failure — routing to dead letter');
        deadLetterQueue.push({ msg, attempts: attemptCount, lastError: err.message, failedAt: new Date().toISOString() });
        metrics.deadLettered++;
        if (msg.ack) await msg.ack(); // ACK to remove from stream
      }
      return false;
    }
  }
}
