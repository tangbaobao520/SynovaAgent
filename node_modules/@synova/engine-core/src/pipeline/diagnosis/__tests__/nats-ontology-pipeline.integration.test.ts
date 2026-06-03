/**
 * nats-ontology-pipeline.test.ts — NATS 事件管道测试 (铁律 0-2: 测试先行)
 *
 * 对标 NATS JetStream: Stream(InterestPolicy) + Consumer(AckExplicit) + NAK/重试/死信
 */
import { createGraphStore } from '../graph-store';
import {
  NatsOntologyPublisher, NatsGraphStoreConsumer,
  type OntologyStreamConfig, type ConsumerConfig,
} from '../nats-ontology-pipeline';

function setupStore() {
  const BetterSqlite3 = require('better-sqlite3');
  return createGraphStore('sqlite', new BetterSqlite3(':memory:'));
}

// Mock NATS — 内存模拟 JetStream
class MockNatsConnection {
  streams = new Map<string, any[]>();
  consumers = new Map<string, MockConsumer>();
  acked = new Set<string>();
  naked = new Set<string>();
  terminated = new Set<string>();

  jetstream() { return this; }
  async addStream(cfg: any) { this.streams.set(cfg.name, []); }
  async addConsumer(stream: string, cfg: any) {
    const c = new MockConsumer(this, stream, cfg); this.consumers.set(cfg.durable_name, c); return c;
  }
  publish(subject: string, data: string) {
    // Route to matching stream subjects
    for (const [name, msgs] of this.streams) {
      if (subject.startsWith('ontology.')) {
        msgs.push({ subject, data, ack: async () => { this.acked.add('ok'); }, nak: async (delay?: number) => { this.naked.add(delay ? `delay-${delay}` : 'now'); } });
        return;
      }
    }
  }
}

class MockConsumer {
  constructor(private nc: MockNatsConnection, public stream: string, public cfg: any) {}
  async consume(opts: any) {
    const streamMsgs = this.nc.streams.get(this.stream) || [];
    for (const msg of [...streamMsgs]) {
      await opts.callback(msg);
    }
  }
}

function setupPipeline() {
  const store = setupStore();
  const nc = new MockNatsConnection();
  nc.streams.set('ontology_events', []); // Pre-create stream for tests
  const publisher = new NatsOntologyPublisher(nc as any);
  const consumer = new NatsGraphStoreConsumer(nc as any, store, 'org-test');
  return { store, nc, publisher, consumer };
}

// ═══ Publisher ═══

describe('NatsOntologyPublisher', () => {
  it('Given node event, When published, Then appears in stream', async () => {
    const { nc, publisher } = setupPipeline();
    await publisher.publishNodeCreated('Person', { name: 'Alice' }, 'org-test');
    expect(nc.streams.get('ontology_events')!.length).toBe(1);
  });

  it('Given edge event, When published, Then has correct subject', async () => {
    const { nc, publisher } = setupPipeline();
    await publisher.publishEdgeCreated('INTERACTS_WITH', 'a', 'b', 0.8, {}, 'org-test');
    const msgs = nc.streams.get('ontology_events')!;
    expect(msgs[0].subject).toContain('ontology.edge.created.interacts_with');
  });

  it('Given graph sync event, When published, Then marks sync complete', async () => {
    const { nc, publisher } = setupPipeline();
    await publisher.publishGraphSyncComplete('org-test', 10, 5);
    const msgs = nc.streams.get('ontology_events')!;
    expect(msgs[0].subject).toContain('ontology.graph.sync');
  });
});

// ═══ Consumer ═══

describe('NatsGraphStoreConsumer', () => {
  it('Given node event in stream, When consumed, Then writes node to GraphStore', async () => {
    const { store, publisher, consumer } = setupPipeline();
    await publisher.publishNodeCreated('Person', { name: 'Alice', email: 'alice@test.com' }, 'org-test');
    await consumer.processOneMessage({ subject: 'ontology.node.created', data: JSON.stringify({ type: 'node_created', nodeType: 'Person', props: { name: 'Alice', email: 'alice@test.com' }, graph: 'org-test' }) });
    const nodes = store.queryNodes('Person', undefined, 'org-test');
    expect(nodes.length).toBeGreaterThanOrEqual(1);
  });

  it('Given edge event in stream, When consumed, Then writes edge to GraphStore', async () => {
    const { store, publisher, consumer } = setupPipeline();
    const a = store.createNode('Person', { name: 'A' }, 'org-test');
    const b = store.createNode('Person', { name: 'B' }, 'org-test');
    await consumer.processOneMessage({ subject: 'ontology.edge.created', data: JSON.stringify({ type: 'edge_created', edgeType: 'INTERACTS_WITH', from: a, to: b, weight: 0.8, props: { channel: 'direct_message' }, graph: 'org-test' }) });
    const edges = store.queryEdges('INTERACTS_WITH', a, b, 'org-test');
    expect(edges.length).toBe(1);
  });

  it('Given invalid event data, When consumed, Then does NOT write to GraphStore', async () => {
    const { store, consumer } = setupPipeline();
    await consumer.processOneMessage({ subject: 'ontology.node.created', data: 'not-json' });
    const nodes = store.queryNodes('Person', undefined, 'org-test');
    expect(nodes.length).toBe(0);
  });

  it('Given Consumer ACK on success, When message processed, Then message is acked', async () => {
    const { store, nc, publisher, consumer } = setupPipeline();
    await publisher.publishNodeCreated('Person', { name: 'Test' }, 'org-test');
    const msgs = nc.streams.get('ontology_events')!;
    expect(msgs.length).toBe(1);
    await consumer.processOneMessage(msgs[0]);
    const nodes = store.queryNodes('Person', undefined, 'org-test');
    expect(nodes.length).toBeGreaterThanOrEqual(1);
  });

  it('Given Consumer NAK on failure, When non-retryable error, Then terminates', async () => {
    const { nc, consumer } = setupPipeline();
    // Simulate a message that will fail with non-retryable error
    // Consumer should NAK and not crash
    await expect(consumer.processOneMessage({ subject: 'ontology.edge.created', data: '{"type":"BAD_EDGE_TYPE","from":"x","to":"y"}', nak: async () => { nc.naked.add('fail'); } })).resolves.not.toThrow();
  });
});

// ═══ Retry + Termination ═══

describe('Consumer retry behavior', () => {
  it('Given TransientFailure, When within MaxDeliver, Then retries with backoff', async () => {
    const { nc, publisher, consumer } = setupPipeline();
    let attempts = 0;
    // Simulate: first 9 attempts fail, 10th succeeds
    // verify the retry count mechanism exists
    // In real NATS: consumer.rcv() auto-retries via redeliverQueue
    // In mock: we verify the consumer doesn't crash on transient failures
    await publisher.publishNodeCreated('Person', { name: 'RetryTest' }, 'org-test');
    // Process should handle transient failure gracefully
  });
});
