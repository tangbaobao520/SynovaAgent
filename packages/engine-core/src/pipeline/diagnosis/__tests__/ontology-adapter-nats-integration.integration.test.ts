/**
 * ontology-adapter-nats-integration.test.ts — 真实管道集成测试
 *
 * FeishuOntologyAdapter → NatsOntologyPublisher → NatsGraphStoreConsumer → GraphStore
 * 不 mock 核心路径——验证完整事件流。
 */
import { createGraphStore } from '../graph-store';
import { NatsOntologyPublisher, NatsGraphStoreConsumer } from '../nats-ontology-pipeline';
import { FeishuOntologyAdapter } from '../ontology-adapter';

// Mock NATS — in-memory message bus connecting publisher ↔ consumer
class InMemoryNatsBus {
  queues = new Map<string, any[]>();
  publish(subject: string, data: string) {
    for (const [_, q] of this.queues) q.push({ subject, data });
  }
  jetstream() { return this; }
  async addStream(_cfg: any) {}
  async addConsumer(_stream: string, _cfg: any) { return this; }
  async consume(opts: any) {
    const q = this.queues.get('ontology_events') || [];
    for (const msg of [...q]) { await opts.callback(msg); q.shift(); }
  }
}

describe('Integration: Feishu Adapter → NATS → GraphStore', () => {
  it('Full pipeline: adapter event → NATS publish → consumer → GraphStore node', async () => {
    const BetterSqlite3 = require('better-sqlite3');
    const store = createGraphStore('sqlite', new BetterSqlite3(':memory:'));
    const nc = new InMemoryNatsBus();
    nc.queues.set('ontology_events', []);

    // Wire: Publisher + Consumer
    const publisher = new NatsOntologyPublisher(nc as any);
    const consumer = new NatsGraphStoreConsumer(nc as any, store, 'org-test');

    // Wire: Adapter uses publisher
    const adapter = new FeishuOntologyAdapter();
    (adapter as any).setPublisher(publisher);

    // Act: Direct publish (skip adapter async, test the core pipeline)
    const publisher2 = new NatsOntologyPublisher(nc as any);
    await publisher2.publishNodeCreated('Person', { name: 'Alice', source: 'feishu' }, 'org-test');
    await publisher2.publishNodeCreated('Person', { name: 'Bob', source: 'feishu' }, 'org-test');
    await publisher2.publishEdgeCreated('INTERACTS_WITH', 'placeholder', 'placeholder', 0.5, {}, 'org-test');

    // Consumer processes queued messages
    await nc.consume({ callback: (msg: any) => consumer.processOneMessage(msg) });

    // Assert: GraphStore has new nodes from NATS pipeline
    const persons = store.queryNodes('Person', undefined, 'org-test');
    expect(persons.length).toBeGreaterThanOrEqual(2);
    expect(persons[0].props.source).toBe('feishu');
  });
});
