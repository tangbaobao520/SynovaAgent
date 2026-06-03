/**
 * nats-pipeline-production.test.ts — 生产级 NATS 管道测试 (Gap 1-5)
 */
import { createGraphStore } from '../graph-store';
import {
  NatsOntologyPublisher, NatsGraphStoreConsumer,
  getPipelineMetrics, pipelineHealth, getDeadLetterQueue, requeueDeadLetter, resetMetrics,
} from '../nats-ontology-pipeline';

beforeEach(() => resetMetrics());

class InMemoryNatsBus {
  queues = new Map<string, any[]>();
  publish(subject: string, data: string) {
    for (const [_, q] of this.queues) q.push({ subject, data });
  }
  jetstream() { return this; }
  async addStream(_: any) {}
  async addConsumer(_s: string, _c: any) { return this; }
  async consume(opts: any) {
    const q = this.queues.get('ontology_events') || [];
    while (q.length > 0) { await opts.callback(q.shift()); }
  }
}

function setup() {
  const BetterSqlite3 = require('better-sqlite3');
  const store = createGraphStore('sqlite', new BetterSqlite3(':memory:'));
  const nc = new InMemoryNatsBus();
  nc.queues.set('ontology_events', []);
  return { store, nc, pub: new NatsOntologyPublisher(nc as any), con: new NatsGraphStoreConsumer(nc as any, store, 'org-test') };
}

describe('Gap 2: Batch Publish', () => {
  it('publishes multiple nodes and edges in one call', async () => {
    const { nc, pub, con } = setup();
    await pub.batchPublish([
      { type: 'node', nodeType: 'Person', props: { name: 'A' } },
      { type: 'node', nodeType: 'Person', props: { name: 'B' } },
      { type: 'edge', edgeType: 'INTERACTS_WITH', from: 'x', to: 'y', weight: 0.5, props: {} },
    ], 'org-test');
    await nc.consume({ callback: (m: any) => con.processOneMessage(m) });
    const m = getPipelineMetrics();
    expect(m.publishedNodes).toBe(2);
    expect(m.publishedEdges).toBe(1);
    expect(m.consumedSuccess).toBeGreaterThanOrEqual(2);
  });
});

describe('Gap 1+4: Error Handling + Dead Letter', () => {
  it('routes invalid edge to dead letter queue', async () => {
    const { nc, con } = setup();
    await con.processOneMessage({ subject: 'e', data: '{"type":"edge_created","edgeType":"X","from":"","to":""}' });
    const dlq = getDeadLetterQueue();
    expect(dlq.length).toBeGreaterThanOrEqual(1);
    expect(dlq[0].lastError).toContain('Invalid edge');
  });

  it('routes unknown event type to dead letter', async () => {
    const { con } = setup();
    await con.processOneMessage({ subject: 'e', data: '{"type":"weird_unknown_type"}' });
    const dlq = getDeadLetterQueue();
    expect(dlq.some(d => d.lastError.includes('Unknown type'))).toBe(true);
  });

  it('requeueDeadLetter removes from DLQ', async () => {
    const { con } = setup();
    await con.processOneMessage({ subject: 'e', data: '{"type":"weird_type"}' });
    const before = getDeadLetterQueue().length;
    requeueDeadLetter(0);
    expect(getDeadLetterQueue().length).toBe(before - 1);
  });
});

describe('Gap 3: Health Check', () => {
  it('reports healthy when no failures', () => {
    const health = pipelineHealth();
    expect(health.status).toBe('healthy');
  });

  it('reports healthy with no failures', () => {
    expect(pipelineHealth().status).toBe('healthy');
  });

  it('tracks metrics when processing messages', async () => {
    const { nc, pub, con } = setup();
    await pub.publishNodeCreated('Person', { name: 'Test' }, 'org-test');
    await nc.consume({ callback: (m: any) => con.processOneMessage(m) });
    const m = getPipelineMetrics();
    expect(m.publishedNodes).toBe(1);
    expect(m.consumedSuccess).toBe(1);
    // DLQ empty when all succeeds
    expect(getDeadLetterQueue()).toHaveLength(0);
  });
});
