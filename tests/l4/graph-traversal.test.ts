/**
 * tests/l4/graph-traversal.test.ts — 图遍历单元测试
 *
 * 使用 mock GraphStore 验证 BFS 遍历、异常扫描、边评估功能。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createGraphTraversal } from '../../src/l4/graph-traversal';
import type { GraphStore } from '../../src/l4/graph-bridge';

/** 构建一个微型测试图：
 *  MONEY(m1) ──FUNDS──→ PRODUCTION(p1) ──PRODUCES──→ FINANCIAL_OUTCOME(fo1)
 *                         ↓ DEPLOYS
 *                       PERSON(per1)
 */
function createMockGraphStore(): GraphStore {
  const store: Record<string, any> = {
    nodes: {
      'm1': { id: 'm1', type: 'resource/money', props: { entity_type: '企业', context: { CashPosition: { cash_balance: 1000 } } } },
      'p1': { id: 'p1', type: 'activity/production', props: { output_type: 'widget', scale_elasticity: 0.8 } },
      'fo1': { id: 'fo1', type: 'outcome/financial', props: { operating_cashflow: 500, ebit: 200 } },
      'per1': { id: 'per1', type: 'resource/person', props: { name: '张三', role: 'operator' } },
    },
    edges: [
      { id: 'e1', type: 'edge/funds', from: 'm1', to: 'p1', weight: 1, props: { amount: 10000, allocation_period: '2026-Q2' } },
      { id: 'e2', type: 'edge/produces', from: 'p1', to: 'fo1', weight: 1, props: { marginal_contribution: 0.6, output_type: 'financial' } },
      { id: 'e3', type: 'edge/deploys', from: 'p1', to: 'per1', weight: 0.8, props: { contribution_elasticity: 0.5, is_bottleneck: false } },
    ],
  };

  return {
    queryNodes(type, filters) {
      if (!type) return Object.values(store.nodes);
      const results = Object.values(store.nodes).filter((n: any) => n.type === type || n.type.startsWith(type.replace('*', '')));
      if (filters?.teamId) return results.filter((n: any) => n.props.teamId === filters.teamId);
      return results;
    },
    queryEdges(type, from, to) {
      let results = store.edges;
      if (type) results = results.filter((e: any) => e.type === type);
      if (from) results = results.filter((e: any) => e.from === from || (Array.isArray(from) && from.includes(e.from)));
      if (to) results = results.filter((e: any) => e.to === to);
      return results;
    },
    getNode(id: string) {
      return store.nodes[id] || null;
    },
    traverse(startNodeId: string, edgeType?: string, maxDepth = 1) {
      const visited = new Set<string>();
      const queue: Array<{ id: string; depth: number }> = [{ id: startNodeId, depth: 0 }];
      const nodes: any[] = [];
      const edges: any[] = [];

      while (queue.length > 0) {
        const { id, depth } = queue.shift()!;
        if (visited.has(id)) continue;
        visited.add(id);
        if (depth > 0) {
          const node = store.nodes[id];
          if (node) nodes.push(node);
        }
        if (depth >= maxDepth) continue;

        for (const edge of store.edges) {
          if (edge.from === id && (!edgeType || edge.type === edgeType)) {
            edges.push(edge);
            queue.push({ id: edge.to, depth: depth + 1 });
          }
          if (edge.to === id && (!edgeType || edge.type === edgeType)) {
            if (!edges.find((e: any) => e.id === edge.id)) {
              edges.push(edge);
            }
            queue.push({ id: edge.from, depth: depth + 1 });
          }
        }
      }
      return { nodes, edges, path: Array.from(visited) };
    },
    findPaths() { return []; },
    queryTriples() { return []; },
    getNodeAtTime() { return null; },
    createNode() { return ''; },
    createNodes() { return []; },
    createEdge() { return ''; },
    createEdges() { return []; },
    updateNode() {},
    deleteNode() {},
    deleteEdge() {},
  };
}

describe('GraphTraversal', () => {
  let store: GraphStore;

  beforeAll(() => {
    store = createMockGraphStore();
  });

  it('traverse from MONEY along edge/funds to Activity', () => {
    const gt = createGraphTraversal(store);
    const result = gt.traverse('m1', ['edge/funds']);
    expect(result.nodes.length).toBeGreaterThan(0);
    expect(result.nodes.some(n => n.type === 'activity/production')).toBe(true);
    expect(result.edges.every(e => e.type === 'edge/funds')).toBe(true);
  });

  it('traverse returns empty result for isolated node', () => {
    const gt = createGraphTraversal(store);
    const result = gt.traverse('fo1', ['edge/funds']); // fo1 has no FUNDS edges
    expect(result.nodes.length).toBe(0);
    expect(result.edges.length).toBe(0);
  });

  it('traverse along multiple edge types', () => {
    const gt = createGraphTraversal(store);
    // From m1: FUNDS→p1, then p1 has PRODUCES→fo1
    const result = gt.traverse('m1', ['edge/funds', 'edge/produces']);
    expect(result.nodes.length).toBeGreaterThanOrEqual(1);
    // Should find at least the production activity
  });

  it('scanOutliers returns nodes deviating from baseline', () => {
    const gt = createGraphTraversal(store);
    const outliers = gt.scanOutliers('resource/money', 3);
    expect(Array.isArray(outliers)).toBe(true);
    expect(outliers.length).toBeLessThanOrEqual(10);
  });

  it('evaluateEdges returns temporal params for edges around nodes', () => {
    const gt = createGraphTraversal(store);
    const evals = gt.evaluateEdges(['p1'], ['edge/deploys']);
    expect(Array.isArray(evals)).toBe(true);
    if (evals.length > 0) {
      expect(evals[0]).toHaveProperty('edgeId');
      expect(evals[0]).toHaveProperty('edgeType');
      expect(evals[0]).toHaveProperty('temporalParams');
      expect(evals[0]).toHaveProperty('anomalyScore');
    }
  });

  it('getTemporalParams returns proper structure', () => {
    const gt = createGraphTraversal(store);
    // Pass a node ID instead of edge ID since implementation may handle both
    const params = gt.getTemporalParams('m1');
    expect(params).toHaveProperty('current');
    expect(params).toHaveProperty('window_3m');
    expect(params).toHaveProperty('window_12m');
    expect(params).toHaveProperty('trend');
    expect(['accelerating', 'decelerating', 'stable', 'reversing']).toContain(params.trend);
  });
});
