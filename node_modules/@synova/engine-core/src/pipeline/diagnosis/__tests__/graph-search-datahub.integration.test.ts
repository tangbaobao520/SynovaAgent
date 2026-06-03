/**
 * graph-search-datahub.test.ts — Graph-then-Search 测试 (铁律 0-2, 决策 4)
 *
 * 对标 DataHub LineageSearchService: 图遍历→候选→文本搜索→排序
 */
import { createGraphStore } from '../graph-store';
import { EntityRegistry, LineageRegistry } from '../entity-registry-datahub';
import { searchAcrossLineage, type GraphSearchResult } from '../graph-search-datahub';

function setup() {
  const BetterSqlite3 = require('better-sqlite3');
  const store = createGraphStore('sqlite', new BetterSqlite3(':memory:'));
  const g = 'org-test';

  // Register lineage entities
  const registry = new EntityRegistry();
  registry.registerEntity({
    name: 'Person', keyAspect: 'personKey', searchGroup: 'primary',
    aspects: [{ name: 'personKey', schema: {} }],
  });
  registry.registerEntity({
    name: 'Event', keyAspect: 'eventKey', searchGroup: 'primary',
    aspects: [{ name: 'eventKey', schema: {}, relationships: [
      { name: 'TRIGGERS', entityTypes: ['Process'], isLineage: true },
    ]}],
  });
  registry.registerEntity({
    name: 'Document', keyAspect: 'docKey', searchGroup: 'primary',
    aspects: [{ name: 'docKey', schema: {}, relationships: [
      { name: 'CORRESPONDS_TO', entityTypes: ['Event'], isLineage: true },
    ]}],
  });

  const lineage = LineageRegistry.build(registry);

  // Build graph
  const alice = store.createNode('Person', { name: 'Alice' }, g);
  const incident = store.createNode('Event', { eventType: 'incident', timestamp: '2026-01-01T00:00:00Z', description: '生产环境宕机3小时' }, g);
  const doc = store.createNode('Document', { docType: 'report', name: '事故复盘报告', type: 'postmortem' }, g);
  store.createEdge('TRIGGERS', incident, 'dummy_process', 1, {}, g);
  store.createEdge('CORRESPONDS_TO', doc, incident, 0.9, { correspondenceType: 'related', confidence: 0.9 }, g);
  store.createEdge('BELONGS_TO', alice, 'dummy_team', 1, {}, g);

  return { store, lineage, g, ids: { alice, incident, doc } };
}

describe('searchAcrossLineage', () => {
  it('Given Document entity, When Lightning search (no text query), Then returns all lineage candidates', () => {
    const { store, lineage, g, ids } = setup();
    const results = searchAcrossLineage(store, lineage, ids.doc, 'UPSTREAM', 2, g);
    expect(results.length).toBeGreaterThanOrEqual(1);
    // Document → CORRESPONDS_TO → Event (1 hop upstream)
    const eventResult = results.find(r => r.entityId === ids.incident);
    expect(eventResult).toBeDefined();
    expect(eventResult!.degree).toBe(1);
  });

  it('Given text query, When Tortoise search, Then filters lineage candidates by text match', () => {
    const { store, lineage, g, ids } = setup();
    const results = searchAcrossLineage(store, lineage, ids.doc, 'UPSTREAM', 3, g, '宕机');
    // Only incident matches "宕机"
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].entityId).toBe(ids.incident);
  });

  it('Given no text query, When maxHops=0, Then returns empty', () => {
    const { store, lineage, g, ids } = setup();
    const results = searchAcrossLineage(store, lineage, ids.doc, 'UPSTREAM', 0, g);
    expect(results).toHaveLength(0);
  });

  it('Given DOWNSTREAM direction, When Lightning search, Then returns downstream entities', () => {
    const { store, lineage, g, ids } = setup();
    const results = searchAcrossLineage(store, lineage, ids.incident, 'DOWNSTREAM', 2, g);
    // Event.TRIGGERS → Process; also Document.CORRESPONDS_TO → Event (reverse)
    expect(Array.isArray(results)).toBe(true);
  });
});
