/**
 * e2e-ontology-pipeline.test.ts — 端到端集成验证
 *
 * 完整链路: 诊断 → 本体图 → 图查询 → 实时监控 → 决策告警
 * 对标 Claw-Code 的 integration test: 真实组件, 不 mock 核心路径。
 */
import { createGraphStore } from '../graph-store';
import { shortestPath, degreeCentrality, detectCommunities } from '../graph-query';
import { monitorEdgeWeight, detectCentralityShift, runMonitorTick } from '../graph-monitor';
import { runDecisionEngine, getDecisionActions } from '../decision-engine';
import { createSnapshot, diffSnapshots } from '../ontology-versioning';
import { applyOntologyPatches } from '../expert-ontology-bridge';
import { ingestDocument } from '../ontology-adapter';
import { generateL2Candidates, computeNameSimilarity } from '../entity-resolver-l2';
import { getTemplate, listTemplates } from '../ontology-templates/index';
import { createGraphStore as createStore, SQLiteGraphStore } from '../graph-store';

describe('E2E: Diagnosis → Ontology → Query → Monitor → Alert', () => {
  const BetterSqlite3 = require('better-sqlite3');
  let store: ReturnType<typeof createGraphStore>;
  const g = 'e2e-org';

  beforeEach(() => { store = createGraphStore('sqlite', new BetterSqlite3(':memory:')); });

  it('Step 1: Ingest document into ontology', () => {
    const { nodeId, edges } = ingestDocument({
      id: 'doc-1', name: 'Q2战略规划', type: 'prd', content: 'test', source: 'user_upload',
      author: 'CEO', authorEmail: 'ceo@test.com', teamId: 'team-exec',
    }, store, g);
    expect(nodeId).toMatch(/^node_Document_/);
    expect(edges.length).toBeGreaterThanOrEqual(2); // OWNS + BELONGS_TO
  });

  it('Step 2: Build graph from evidence nodes+edges', () => {
    const a = store.createNode('Person', { name: 'Alice', email: 'alice@test.com' }, g);
    const b = store.createNode('Person', { name: 'Bob', email: 'bob@test.com' }, g);
    const t = store.createNode('Team', { teamType: 'permanent', name: 'Engineering', teamType: 'permanent' }, g);
    store.createEdge('BELONGS_TO', a, t, 1, {}, g);
    store.createEdge('BELONGS_TO', b, t, 1, {}, g);
    store.createEdge('INTERACTS_WITH', a, b, 0.8, { channel: 'direct_message' }, g);
    expect(store.queryNodes('Person', undefined, g)).toHaveLength(2);
    expect(store.queryEdges('BELONGS_TO', undefined, undefined, g)).toHaveLength(2);
  });

  it('Step 3: Run graph queries', () => {
    const a = store.createNode('Person', { name: 'A' }, g);
    const b = store.createNode('Person', { name: 'B' }, g);
    const c = store.createNode('Person', { name: 'C' }, g);
    store.createEdge('INTERACTS_WITH', a, b, 0.9, { channel: 'direct_message' }, g);
    store.createEdge('INTERACTS_WITH', b, c, 0.7, { channel: 'direct_message' }, g);

    const path = shortestPath(store, a, c, 'INTERACTS_WITH', g);
    expect(path).not.toBeNull();
    expect(path!.length).toBe(2);

    const centrality = degreeCentrality(store, b, g);
    expect(centrality).toBeGreaterThan(0);

    const communities = detectCommunities(store, 2, g);
    expect(communities.length).toBeGreaterThanOrEqual(1);
  });

  it('Step 4: Monitor + detect alerts', () => {
    const a = store.createNode('Person', { name: 'A' }, g);
    const b = store.createNode('Person', { name: 'B' }, g);
    store.createEdge('INTERACTS_WITH', a, b, 0.05, { channel: 'direct_message' }, g); // very weak edge → critical

    const alerts = monitorEdgeWeight(store, 'INTERACTS_WITH', 0.2, g);
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    expect(alerts[0].severity).toBe('high');
  });

  it('Step 5: Decision engine creates actions from alerts', () => {
    const a = store.createNode('Person', { name: 'A' }, g);
    const b = store.createNode('Person', { name: 'B' }, g);
    store.createEdge('INTERACTS_WITH', a, b, 0.05, { channel: 'direct_message' }, g); // very weak → critical action

    const actions = runDecisionEngine(store, g);
    expect(actions.length).toBeGreaterThanOrEqual(1);
    expect(actions[0].priority).toBe('critical');
    expect(getDecisionActions('open').length).toBeGreaterThanOrEqual(1);
  });

  it('Step 6: Versioning — snapshot + diff', () => {
    store.createNode('Person', { name: 'Alice' }, g);
    const snap1 = createSnapshot(store, g);
    store.createNode('Person', { name: 'Bob' }, g);
    const snap2 = createSnapshot(store, g);
    const diff = diffSnapshots(snap1, snap2);
    expect(diff.addedNodes).toHaveLength(1);
  });

  it('Step 7: L2 entity resolution', () => {
    const nodes = [
      { id: 'n1', type: 'Person' as const, props: { name: '张伟', orgId: 'org-1', email: 'zw@a.com' } },
      { id: 'n2', type: 'Person' as const, props: { name: '张伟', orgId: 'org-1', email: 'zhangwei@b.com' } },
    ];
    const candidates = generateL2Candidates(nodes, 0.7);
    expect(candidates.length).toBeGreaterThanOrEqual(1);
  });

  it('Step 8: Ontology templates are loadable', () => {
    const templates = listTemplates();
    expect(templates.length).toBeGreaterThanOrEqual(4);
    const saas = getTemplate('saas-tech');
    expect(saas).toBeDefined();
    expect(saas!.keyMetrics.length).toBeGreaterThanOrEqual(3);
  });
});
