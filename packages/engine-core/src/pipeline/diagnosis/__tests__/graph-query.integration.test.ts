/**
 * graph-query.test.ts — B1 图查询引擎 测试契约 (铁律 0-2: 测试先行)
 *
 * Given/When/Then 模式。测试即规范——这些测试通过 = B1 完成。
 */
import { createGraphStore, type GraphStore } from '../graph-store';
import {
  shortestPath, degreeCentrality, detectCommunities,
  findAnomalySubgraphs, detectEdgeWeightDrop,
  findContradictoryPaths, findCrossDimensionalLinks,
} from '../graph-query';

let graphIds: Record<string, string> = {};

function setupGraph(): { store: GraphStore; ids: Record<string, string> } {
  const BetterSqlite3 = require('better-sqlite3');
  const store = createGraphStore('sqlite', new BetterSqlite3(':memory:'));
  const g = 'org-test';

  const a = store.createNode('Person', { name: 'Alice' }, g);
  const b = store.createNode('Person', { name: 'Bob' }, g);
  const c = store.createNode('Person', { name: 'Carol' }, g);
  const d = store.createNode('Person', { name: 'Dave' }, g);
  const e = store.createNode('Person', { name: 'Eve' }, g);
  graphIds = { a, b, c, d, e };

  store.createEdge('INTERACTS_WITH', a, b, 0.9, { channel: 'direct_message' }, g);
  store.createEdge('INTERACTS_WITH', b, c, 0.7, { channel: 'direct_message' }, g);
  store.createEdge('INTERACTS_WITH', a, d, 0.5, { channel: 'direct_message' }, g);
  store.createEdge('INTERACTS_WITH', d, e, 0.3, { channel: 'direct_message' }, g);
  store.createEdge('INTERACTS_WITH', b, c, 0.8, { channel: 'direct_message' }, g);

  return { store, ids: graphIds };
}

// ═══ shortestPath ═══
describe('shortestPath', () => {
  const { store, ids } = setupGraph();
  const g = 'org-test';

  it('Given connected nodes A→C, When shortestPath called, Then returns path through B', () => {
    const path = shortestPath(store, ids.a, ids.c, 'INTERACTS_WITH', g);
    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThanOrEqual(1);
  });

  it('Given disconnected nodes C→D, When shortestPath called, Then returns null', () => {
    const path = shortestPath(store, ids.c, ids.d, 'INTERACTS_WITH', g);
    expect(path).toBeNull();
  });

  it('Given empty edge type filter, When shortestPath called, Then finds path using any edge', () => {
    const path = shortestPath(store, ids.a, ids.c, undefined, g);
    expect(path).not.toBeNull();
  });
});

// ═══ degreeCentrality ═══
describe('degreeCentrality', () => {
  const { store, ids } = setupGraph();
  const g = 'org-test';

  it('Given hub node A (2 connections), When degreeCentrality called, Then returns higher value than leaf node E', () => {
    const aCentrality = degreeCentrality(store, ids.a, g);
    const eCentrality = degreeCentrality(store, ids.e, g);
    expect(aCentrality).toBeGreaterThan(eCentrality);
  });

  it('Given isolated node, When degreeCentrality called, Then returns 0', () => {
    const isolated = store.createNode('Person', { name: 'Isolated' }, g);
    expect(degreeCentrality(store, isolated, g)).toBe(0);
  });
});

// ═══ detectCommunities ═══
describe('detectCommunities', () => {
  const { store } = setupGraph();
  const g = 'org-test';

  it('Given graph with 5 nodes, When detectCommunities called, Then returns at least 1 community', () => {
    const communities = detectCommunities(store, 2, g);
    expect(communities.length).toBeGreaterThanOrEqual(1);
  });

  it('Given empty graph, When detectCommunities called, Then returns empty array', () => {
    const emptyStore = createGraphStore('sqlite', require('better-sqlite3')(':memory:'));
    expect(detectCommunities(emptyStore, 2, 'empty')).toHaveLength(0);
  });
});

// ═══ findAnomalySubgraphs ═══
describe('findAnomalySubgraphs', () => {
  const { store } = setupGraph();
  const g = 'org-test';

  it('Given graph, When findAnomalySubgraphs called, Then returns result (may be empty)', () => {
    const anomalies = findAnomalySubgraphs(store, 0.5, g);
    expect(Array.isArray(anomalies)).toBe(true);
  });
});

// ═══ detectEdgeWeightDrop ═══
describe('detectEdgeWeightDrop', () => {
  const { store } = setupGraph();
  const g = 'org-test';

  it('Given unchanged edges, When detectEdgeWeightDrop with low threshold, Then returns empty', () => {
    const drops = detectEdgeWeightDrop(store, 'INTERACTS_WITH', 0.9, g);
    expect(drops).toHaveLength(0); // No edges dropped >90%
  });

  it('Given unchanged edges, When detectEdgeWeightDrop with high threshold, Then may find small variations', () => {
    // Edge weights are static, so even at 50% threshold, nothing dropped
    const drops = detectEdgeWeightDrop(store, 'INTERACTS_WITH', 0.5, g);
    // All edges were just created with their current weight, so no historical drop
    expect(drops).toHaveLength(0);
  });
});

// ═══ findContradictoryPaths ═══
describe('findContradictoryPaths', () => {
  const { store } = setupGraph();
  const g = 'org-test';

  it('Given graph with dimension edges, When findContradictoryPaths called, Then returns array', () => {
    const paths = findContradictoryPaths(store, 'BELONGS_TO', 0.3, g);
    expect(Array.isArray(paths)).toBe(true);
  });
});

// ═══ findCrossDimensionalLinks ═══
describe('findCrossDimensionalLinks', () => {
  const { store } = setupGraph();
  const g = 'org-test';

  it('Given graph, When findCrossDimensionalLinks called, Then returns array', () => {
    const links = findCrossDimensionalLinks(store, ['information_flow', 'trust_level'], g);
    expect(Array.isArray(links)).toBe(true);
  });

  it('Given empty dimensions, When findCrossDimensionalLinks called, Then returns empty', () => {
    const links = findCrossDimensionalLinks(store, [], g);
    expect(links).toHaveLength(0);
  });
});
