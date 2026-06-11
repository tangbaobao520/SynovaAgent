/**
 * ontology-api.test.ts — 本体 API 端点测试 (铁律 0-2)
 *
 * 可展示的最小切片: 文档上传 → 本体图 → 查询 → 展示
 */
import { createGraphStore } from '../graph-store';
import { ingestDocument, updateDocumentVersion } from '../ontology-adapter';
import { searchAcrossLineage } from '../graph-search-datahub';
import { EntityRegistry, LineageRegistry } from '../entity-registry-datahub';
import { shortestPath, degreeCentrality } from '../graph-query';

function setup() {
  const BetterSqlite3 = require('better-sqlite3');
  return createGraphStore('sqlite', new BetterSqlite3(':memory:'));
}

describe('Ontology API — Ingest', () => {
  it('Given document upload, When ingested, Then Document node + OWNS + BELONGS_TO edges created', () => {
    const store = setup();
    const { nodeId, edges } = ingestDocument({
      id: 'doc-1', name: 'Q2战略规划', type: 'prd', content: 'test', source: 'user_upload',
      author: '张总', authorEmail: 'zhang@test.com', teamId: 'team-exec',
    }, store, 'org-1');
    expect(nodeId).toMatch(/^node_Document_/);
    expect(edges.length).toBeGreaterThanOrEqual(2); // OWNS + BELONGS_TO
  });

  it('Given multiple documents, When ingested, Then stored separately in org isolation', () => {
    const store = setup();
    ingestDocument({ id: 'd1', name: 'A报告', type: 'report', content: 'x', source: 'user_upload' }, store, 'org-A');
    ingestDocument({ id: 'd2', name: 'B报告', type: 'report', content: 'x', source: 'user_upload' }, store, 'org-B');
    expect(store.queryNodes('Document', undefined, 'org-A')).toHaveLength(1);
    expect(store.queryNodes('Document', undefined, 'org-B')).toHaveLength(1);
  });

  it('Given document version update, Then old node NOT deleted + DEPENDS_ON edge valid (P0 fix 2)', () => {
    const store = setup(); const g = 'org-1';
    const { nodeId: v1 } = ingestDocument({
      id: 'doc-v1', name: 'Q1报告', type: 'report', content: 'v1 content', source: 'user_upload',
    }, store, g);

    const { newNodeId, oldNodeId } = updateDocumentVersion(v1, {
      id: 'doc-v2', name: 'Q1报告 v2', type: 'report', content: 'v2 content', source: 'user_upload',
    }, store, g);

    // Old node should still exist (not hard-deleted)
    const oldNode = store.getNode(oldNodeId, g);
    expect(oldNode).not.toBeNull();
    expect(oldNode!.props.deprecated).toBe(true);

    // New node should exist
    const newNode = store.getNode(newNodeId, g);
    expect(newNode).not.toBeNull();

    // CORRESPONDS_TO edge should exist (new → old, supersedes)
    const edges = store.queryEdges('CORRESPONDS_TO', newNodeId, oldNodeId, g);
    expect(edges.length).toBe(1);
  });
});

describe('Ontology API — Graph Query', () => {
  it('Given graph with Person+Team+edges, When queried, Then returns nodes and edges', () => {
    const store = setup(); const g = 'org-1';
    const a = store.createNode('Person', { name: 'Alice' }, g);
    const t = store.createNode('Team', { teamType: 'permanent', name: 'Engineering', teamType: 'permanent' }, g);
    store.createEdge('BELONGS_TO', a, t, 1, {}, g);
    store.createEdge('INTERACTS_WITH', a, a, 0.5, { channel: 'direct_message' }, g);

    const persons = store.queryNodes('Person', undefined, g);
    const teams = store.queryNodes('Team', undefined, g);
    const edges = store.queryEdges(undefined, undefined, undefined, g);

    expect(persons.length).toBe(1);
    expect(teams.length).toBe(1);
    expect(edges.length).toBe(2);
  });

  it('Given graph, When shortestPath called, Then returns path between nodes', () => {
    const store = setup(); const g = 'org-1';
    const a = store.createNode('Person', { name: 'A' }, g);
    const b = store.createNode('Person', { name: 'B' }, g);
    store.createEdge('INTERACTS_WITH', a, b, 0.8, { channel: 'direct_message' }, g);

    const path = shortestPath(store, a, b, 'INTERACTS_WITH', g);
    expect(path).not.toBeNull();
    expect(path!.length).toBe(1);
  });
});

describe('Ontology API — Graph-then-Search', () => {
  it('Given Document linked to Event, When searchAcrossLineage, Then finds connected entities', () => {
    const store = setup(); const g = 'org-1';

    const registry = new EntityRegistry();
    registry.registerEntity({ name: 'Document', keyAspect: 'docKey', searchGroup: 'primary',
      aspects: [{ name: 'docKey', schema: {}, relationships: [{ name: 'CORRESPONDS_TO', entityTypes: ['Event'], isLineage: true }] }] });
    const lineage = LineageRegistry.build(registry);

    const doc = store.createNode('Document', { docType: 'report', name: '事故复盘', type: 'postmortem' }, g);
    const incident = store.createNode('Event', { eventType: 'incident', timestamp: '2026-01-01T00:00:00Z', description: '宕机' }, g);
    store.createEdge('CORRESPONDS_TO', doc, incident, 0.9, { correspondenceType: 'related', confidence: 0.9 }, g);

    const results = searchAcrossLineage(store, lineage, doc, 'UPSTREAM', 2, g, '宕机');
    expect(results.length).toBeGreaterThanOrEqual(1);
  });
});
