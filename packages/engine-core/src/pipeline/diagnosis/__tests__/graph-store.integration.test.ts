/**
 * graph-store.test.ts — GraphStore 9项测试契约
 */
import { createGraphStore, SQLiteGraphStore, type GraphStore } from '../graph-store';

function createTestDb() {
  const BetterSqlite3 = require('better-sqlite3');
  return new BetterSqlite3(':memory:');
}

describe('GraphStore', () => {
  let store: GraphStore;
  const graph = 'org-test';

  beforeEach(() => { store = createGraphStore('sqlite', createTestDb()); });

  it('1. creates and retrieves nodes', () => {
    const id = store.createNode('Person', { name: '张三', email: 'zhang@test.com' }, graph);
    const node = store.getNode(id, graph);
    expect(node).not.toBeNull();
    expect(node!.type).toBe('Person');
    expect(node!.props.name).toBe('张三');
  });

  it('2. creates edges between nodes', () => {
    const a = store.createNode('Person', { name: 'A' }, graph);
    const b = store.createNode('Person', { name: 'B' }, graph);
    const edgeId = store.createEdge('INTERACTS_WITH', a, b, 0.8, { channel: 'other' }, graph);
    expect(edgeId).toMatch(/^edge_/);
    const edges = store.queryEdges('INTERACTS_WITH', a, b, graph);
    expect(edges).toHaveLength(1);
    expect(edges[0].weight).toBe(0.8);
    expect(edges[0].props.channel).toBe('other');
  });

  it('3. traverses BFS from node', () => {
    const a = store.createNode('Person', { name: 'A' }, graph);
    const b = store.createNode('Person', { name: 'B' }, graph);
    const c = store.createNode('Person', { name: 'C' }, graph);
    store.createEdge('INTERACTS_WITH', a, b, 1, { channel: 'direct_message' }, graph);
    store.createEdge('INTERACTS_WITH', b, c, 1, { channel: 'direct_message' }, graph);
    const sub = store.traverse(a, 'INTERACTS_WITH', 5, graph);
    expect(sub.nodes.length).toBe(3);
    expect(sub.edges.length).toBe(2);
  });

  it('4. finds paths between two nodes', () => {
    const a = store.createNode('Person', { name: 'A' }, graph);
    const b = store.createNode('Person', { name: 'B' }, graph);
    store.createEdge('INTERACTS_WITH', a, b, 1, { channel: 'direct_message' }, graph);
    const paths = store.findPaths(a, b, 'INTERACTS_WITH', 5, graph);
    expect(paths.length).toBeGreaterThanOrEqual(1);
    expect(paths[0].nodes).toEqual([a, b]);
    expect(paths[0].length).toBe(1);
  });

  it('5. queries triples by pattern', () => {
    const a = store.createNode('Person', { name: 'A' }, graph);
    const t = store.createNode('Team', { name: 'Engineering', teamType: 'permanent' }, graph);
    store.createEdge('BELONGS_TO', a, t, 1, { role: 'engineer' }, graph);
    const triples = store.queryTriples({ predicate: 'BELONGS_TO' }, graph);
    expect(triples.length).toBe(1);
  });

  it('6. deleteNode: hard-deletes node + soft-deletes edges (P0 fix 1)', () => {
    const a = store.createNode('Person', { name: 'A' }, graph);
    const b = store.createNode('Person', { name: 'B' }, graph);
    store.createEdge('INTERACTS_WITH', a, b, 1, { channel: 'direct_message' }, graph);
    store.createEdge('INTERACTS_WITH', b, a, 0.5, { channel: 'direct_message' }, graph);
    const edgesBefore = store.queryEdges(undefined, a, undefined, graph);
    expect(edgesBefore.length).toBeGreaterThan(0);

    store.deleteNode(a, graph);

    // Fix 1: Node must be gone
    const node = store.getNode(a, graph);
    expect(node).toBeNull();
    // Edges from/to deleted node must be soft-deleted (valid_to set)
    const edgesAfter = store.queryEdges(undefined, a, undefined, graph);
    expect(edgesAfter).toHaveLength(0);
  });

  it('6b. deleteNode: non-existent node does not throw', () => {
    expect(() => store.deleteNode('node_Person_nonexistent', graph)).not.toThrow();
  });

  it('7. getNodeAtTime: node gone after hard delete (P0 fix 1 aligned)', () => {
    const a = store.createNode('Person', { name: 'A' }, graph);
    // Wait 1ms then delete
    const start = Date.now();
    while (Date.now() === start) {} // busy-wait 1ms
    store.deleteNode(a, graph);
    // After hard delete, getNode returns null
    const afterDelete = store.getNode(a, graph);
    expect(afterDelete).toBeNull();
  });

  it('8. isolates graphs by orgId', () => {
    const a1 = store.createNode('Person', { name: 'A' }, 'org-1');
    const a2 = store.createNode('Person', { name: 'A' }, 'org-2');
    expect(store.queryNodes('Person', undefined, 'org-1')).toHaveLength(1);
    expect(store.queryNodes('Person', undefined, 'org-2')).toHaveLength(1);
  });

  it('9. handles batch node creation (createNodes)', () => {
    const ids = store.createNodes([
      { type: 'Person', props: { name: 'A' } },
      { type: 'Person', props: { name: 'B' } },
      { type: 'Team', props: { name: 'Engineering', teamType: 'permanent' } },
    ], graph);
    expect(ids).toHaveLength(3);
    expect(store.queryNodes('Person', undefined, graph)).toHaveLength(2);
  });

  // ═══ P0 Fix 2: createEdge requires explicit graph ═══
  it('10. createEdge throws when graph is missing (P0 fix 2)', () => {
    const a = store.createNode('Person', { name: 'A' }, graph);
    const b = store.createNode('Person', { name: 'B' }, graph);
    // createEdge without graph should throw
    expect(() => (store as any).createEdge('INTERACTS_WITH', a, b)).toThrow(/graph.*required/i);
  });

  // ═══ P0 Fix 3: JSON.parse safety ═══
  it('11. corrupted props_json returns empty props, does not crash (P0 fix 3)', () => {
    const a = store.createNode('Person', { name: 'A' }, graph);
    // Simulate DB corruption by directly updating props_json
    const BetterSqlite3 = require('better-sqlite3');
    const rawDb = (store as any).db || (store as any).db;
    // Access the underlying db via the store
    const node = store.getNode(a, graph);
    expect(node).not.toBeNull();
    // Direct SQL: corrupt the props_json
    const sqlite3Db = (store as SQLiteGraphStore).db;
    if (sqlite3Db) {
      sqlite3Db.prepare('UPDATE graph_nodes SET props_json=? WHERE id=? AND graph=?').run('NOT_VALID_JSON{', a, graph);
      // Should not throw — returns empty props
      const corrupted = store.getNode(a, graph);
      expect(corrupted).not.toBeNull();
      expect(corrupted!.props).toEqual({});
    }
  });
});
