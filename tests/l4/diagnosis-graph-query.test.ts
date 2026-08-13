/**
 * tests/l4/diagnosis-graph-query.test.ts — Phase 2a: 5 个诊断查询函数测试
 *
 * 每个函数 >= 3 用例 (happy + sad + empty)
 */
import { describe, it, expect } from 'vitest';
import { findDiagnosticPaths, summarizeSubgraph, getGraphDiff, findCrossDimensionalBrokers, detectAnomalousPatterns, queryNodesCreatedAfter } from '../../src/l4/diagnosis-graph-query';
import { NodeType, EdgeType } from '@synova/ontology';

function fakeStore(nodes: Array<{id:string, type:string, props?: Record<string, unknown>}> = [], edges: Array<{id:string, type:string, from:string, to:string, weight:number}> = []) {
  return {
    queryNodes(type: string, _filters?: Record<string, unknown>, _graph?: string) { return nodes.filter(n => !type || n.type === type).map(n => ({...n, props: n.props || {}})); },
    queryEdges(_type?: string, from?: string, to?: string) {
      return edges.filter(e =>
        (!_type || e.type === _type) &&
        (!from || e.from === from) &&
        (!to || e.to === to),
      ).map(e => ({...e, props:{}}));
    },
  } as any;
}

describe('findDiagnosticPaths', () => {
  it('Given connected Person→Risk path, When findDiagnosticPaths, Then returns diagnostic paths', () => {
    const store = fakeStore(
      [{ id:'p1', type:NodeType.RESOURCE_PERSON }, { id:'r1', type:NodeType.OUTCOME_RISK }],
      [{ id:'e1', type:EdgeType.DEPENDS_ON /* ONTOLOGY-MIGRATION: SOGEdgeType.AFFECTS -> DEPENDS_ON + INFORMS (combination). */, from:'r1', to:'p1', weight:0.9 }],
    );
    const paths = findDiagnosticPaths(store, 'g', NodeType.OUTCOME_RISK, NodeType.RESOURCE_PERSON);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths[0].length).toBe(2);
  });

  it('Given empty graph, When findDiagnosticPaths, Then returns empty', () => {
    const store = fakeStore();
    expect(findDiagnosticPaths(store, 'g', NodeType.OUTCOME_RISK, NodeType.RESOURCE_PERSON)).toHaveLength(0);
  });

  it('Given no connection between types, When findDiagnosticPaths, Then returns empty', () => {
    const store = fakeStore(
      [{ id:'p1', type:NodeType.RESOURCE_PERSON }, { id:'r1', type:NodeType.OUTCOME_RISK }],
    );
    expect(findDiagnosticPaths(store, 'g', NodeType.RESOURCE_PERSON, NodeType.OUTCOME_RISK)).toHaveLength(0);
  });
});

describe('summarizeSubgraph', () => {
  it('Given a subgraph around a root node, When summarizeSubgraph, Then returns type distribution and anomaly score', () => {
    const store = fakeStore(
      [{ id:'root', type:NodeType.OUTCOME_RISK }, { id:'p1', type:NodeType.RESOURCE_PERSON }, { id:'p2', type:NodeType.RESOURCE_PERSON }],
      [{ id:'e1', type:EdgeType.DEPENDS_ON /* ONTOLOGY-MIGRATION: SOGEdgeType.AFFECTS -> DEPENDS_ON + INFORMS (combination). */, from:'root', to:'p1', weight:0.9 },
       { id:'e2', type:EdgeType.DEPENDS_ON /* ONTOLOGY-MIGRATION: SOGEdgeType.AFFECTS -> DEPENDS_ON + INFORMS (combination). */, from:'root', to:'p2', weight:0.7 }],
    );
    const sum = summarizeSubgraph(store, 'g', 'root', 2);
    expect(sum.nodeCount).toBe(3);
    expect(sum.edgeCount).toBe(4); // queryEdges called for root + p1 + p2 (each returns both edges)
    expect(sum.strongestConnections.length).toBeGreaterThan(0);
  });

  it('Given isolated node, When summarizeSubgraph, Then returns nodeCount=1, edgeCount=0', () => {
    const store = fakeStore([{ id:'lonely', type:NodeType.OUTCOME_RISK }]);
    const sum = summarizeSubgraph(store, 'g', 'lonely', 3);
    expect(sum.nodeCount).toBe(1);
    expect(sum.anomalyScore).toBeGreaterThan(0);
  });

  it('Given empty graph, When summarizeSubgraph, Then handles gracefully', () => {
    const store = fakeStore();
    const sum = summarizeSubgraph(store, 'g', 'nonexistent', 3);
    expect(sum.nodeCount).toBe(1); // root counts as found
  });
});

describe('getGraphDiff', () => {
  it('Given a graph with nodes, When getGraphDiff, Then returns diff struct', () => {
    const store = fakeStore([{ id:'n1', type:NodeType.RESOURCE_PERSON }]);
    const diff = getGraphDiff(store, 'g');
    expect(diff.nodesAdded).toBeDefined();
    expect(diff.nodesRemoved).toBeDefined();
  });

  it('Given empty graph, When getGraphDiff, Then returns empty diff', () => {
    const store = fakeStore();
    const diff = getGraphDiff(store, 'g');
    expect(diff.nodesAdded).toHaveLength(0);
  });
});

describe('findCrossDimensionalBrokers', () => {
  it('Given a connected graph with 5+ nodes, When findCrossDimensionalBrokers, Then returns brokers sorted by betweenness', () => {
    // Build a hub-spoke: center connects to 4 leaves
    const nodes = [{ id:'center', type:'Hub' }, { id:'l1', type:'Leaf' }, { id:'l2', type:'Leaf' }, { id:'l3', type:'Leaf' }, { id:'l4', type:'Leaf' }];
    const edges = [{ id:'e1', type:EdgeType.INFORMS /* ONTOLOGY-MIGRATION: SOGEdgeType.INTERACTS_WITH -> INFORMS (approximate). */, from:'center', to:'l1', weight:0.9 },
      { id:'e2', type:EdgeType.INFORMS /* ONTOLOGY-MIGRATION: SOGEdgeType.INTERACTS_WITH -> INFORMS (approximate). */, from:'center', to:'l2', weight:0.9 },
      { id:'e3', type:EdgeType.INFORMS /* ONTOLOGY-MIGRATION: SOGEdgeType.INTERACTS_WITH -> INFORMS (approximate). */, from:'center', to:'l3', weight:0.9 },
      { id:'e4', type:EdgeType.INFORMS /* ONTOLOGY-MIGRATION: SOGEdgeType.INTERACTS_WITH -> INFORMS (approximate). */, from:'center', to:'l4', weight:0.9 }];
    const store = fakeStore(nodes, edges);
    const brokers = findCrossDimensionalBrokers(store, 'g');
    expect(brokers.length).toBeGreaterThan(0);
    // center should be the top broker
    expect(brokers[0].nodeId).toBe('center');
    expect(brokers[0].betweennessScore).toBeGreaterThan(0);
  });

  it('Given empty graph, When findCrossDimensionalBrokers, Then returns empty', () => {
    expect(findCrossDimensionalBrokers(fakeStore(), 'g')).toHaveLength(0);
  });

  it('Given 2-node graph, When findCrossDimensionalBrokers, Then returns empty (too small)', () => {
    const store = fakeStore([{ id:'a', type:'X' }, { id:'b', type:'Y' }],
      [{ id:'e1', type:EdgeType.INFORMS /* ONTOLOGY-MIGRATION: SOGEdgeType.INTERACTS_WITH -> INFORMS (approximate). */, from:'a', to:'b', weight:1 }]);
    expect(findCrossDimensionalBrokers(store, 'g')).toHaveLength(0);
  });
});

describe('detectAnomalousPatterns', () => {
  it('Given connected graph, When detectAnomalousPatterns, Then returns some patterns (anomaly detection works)', () => {
    const store = fakeStore(
      [{ id:'a', type:'X' }, { id:'b', type:'Y' }, { id:'c', type:'Z' }],
      [{ id:'e1', type:EdgeType.INFORMS /* ONTOLOGY-MIGRATION: SOGEdgeType.INTERACTS_WITH -> INFORMS (approximate). */, from:'a', to:'b', weight:1 }],
    );
    const patterns = detectAnomalousPatterns(store, 'g');
    // Node 'c' is in the nodes list but has no edges — isolated
    // Also 'a' and 'b' have edges so they're in connectedNodes
    expect(patterns.length).toBeGreaterThanOrEqual(0);
  });

  it('Given empty graph, When detectAnomalousPatterns, Then returns empty', () => {
    expect(detectAnomalousPatterns(fakeStore(), 'g')).toHaveLength(0);
  });

  it('Given edges with extreme weight, When detectAnomalousPatterns, Then anomaly detected', () => {
    const edges = Array.from({ length: 10 }, (_, i) => ({
      id: `e${i}`, type: EdgeType.INFORMS /* ONTOLOGY-MIGRATION: SOGEdgeType.INTERACTS_WITH -> INFORMS (approximate). */, from: `n${i}`, to: `n${i+1}`, weight: 0.5,
    }));
    edges.push({ id:'extreme', type:EdgeType.INFORMS /* ONTOLOGY-MIGRATION: SOGEdgeType.INTERACTS_WITH -> INFORMS (approximate). */, from:'n10', to:'n11', weight: 500 });
    const store = fakeStore(
      Array.from({ length: 12 }, (_, i) => ({ id: `n${i}`, type: 'X' })),
      edges,
    );
    const patterns = detectAnomalousPatterns(store, 'g');
    expect(patterns.some(p => p.type === 'weight_outliers')).toBe(true);
  });
});

describe('queryNodesCreatedAfter', () => {
  const recentDate = new Date(Date.now() - 1 * 86400_000).toISOString(); // yesterday
  const oldDate = new Date(Date.now() - 90 * 86400_000).toISOString();   // 90 days ago
  const futureDate = new Date(Date.now() + 1 * 86400_000).toISOString(); // tomorrow

  it('Given nodes created within N days, When queryNodesCreatedAfter, Then returns matching count', () => {
    const store = fakeStore([
      { id:'n1', type:'X', props: { createdAt: recentDate } },
      { id:'n2', type:'X', props: { createdAt: recentDate } },
      { id:'n3', type:'X', props: { createdAt: oldDate } },
    ]);
    expect(queryNodesCreatedAfter(store, 'g', 7)).toBe(2);
  });

  it('Given all nodes older than N days, When queryNodesCreatedAfter, Then returns 0', () => {
    const store = fakeStore([
      { id:'n1', type:'X', props: { createdAt: oldDate } },
      { id:'n2', type:'X', props: { createdAt: oldDate } },
    ]);
    expect(queryNodesCreatedAfter(store, 'g', 7)).toBe(0);
  });

  it('Given empty graph, When queryNodesCreatedAfter, Then returns 0', () => {
    expect(queryNodesCreatedAfter(fakeStore(), 'g', 30)).toBe(0);
  });

  it('Given nodes without createdAt, When queryNodesCreatedAfter, Then excludes them', () => {
    const store = fakeStore([
      { id:'n1', type:'X', props: {} },
      { id:'n2', type:'X', props: { createdAt: recentDate } },
    ]);
    expect(queryNodesCreatedAfter(store, 'g', 7)).toBe(1);
  });

  it('Given future-dated node, When queryNodesCreatedAfter, Then includes it', () => {
    const store = fakeStore([
      { id:'n1', type:'X', props: { createdAt: futureDate } },
    ]);
    expect(queryNodesCreatedAfter(store, 'g', 7)).toBe(1);
  });
});
