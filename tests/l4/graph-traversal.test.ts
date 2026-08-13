/**
 * tests/l4/graph-traversal.test.ts — 图遍历引擎测试
 */
import { describe, it, expect } from 'vitest';
import { createGraphTraversal } from '../../src/l4/graph-traversal';

function createMockStore() {
  const nodes: Array<{ id: string; type: string; props: Record<string, unknown> }> = [
    { id: 'money-001', type: 'resource/money', props: { cash_balance: 500000, total_debt: 1000000 } },
    { id: 'money-002', type: 'resource/money', props: { cash_balance: 200000, total_debt: 3000000 } },
    { id: 'money-003', type: 'resource/money', props: { cash_balance: 800000, total_debt: 500000 } },
    { id: 'prod-001', type: 'activity/production', props: { cycle_time_hours: 24, capacity_utilization: 0.8 } },
  ];
  const edges: Array<{ id: string; type: string; from: string; to: string; weight: number; props: Record<string, unknown> }> = [
    { id: 'edge-001', type: 'DEPLOYS', from: 'money-001', to: 'prod-001', weight: 0.5, props: { contribution_elasticity: 0.3 } },
    { id: 'edge-002', type: 'DEPLOYS', from: 'money-002', to: 'prod-001', weight: 0.3, props: { contribution_elasticity: 0.5 } },
  ];
  return {
    queryNodes: (type: string, _f?: Record<string, unknown>) => nodes.filter(n => n.type === type),
    queryEdges: (t?: string, from?: string) => {
      let r = edges;
      if (t) r = r.filter(e => e.type === t);
      if (from) r = r.filter(e => e.from === from);
      return r;
    },
    getNode: (id: string): Record<string, unknown> | null => {
      const n = nodes.find(n => n.id === id);
      return n ? { id: n.id, type: n.type, props: n.props } : null;
    },
  };
}

describe('GraphTraversal', () => {
  const store = createMockStore();

  // ═══ traverse() ═══

  it('traverse from money along DEPLOYS finds production', () => {
    const gt = createGraphTraversal(store);
    const result = gt.traverse(['money-001'], ['DEPLOYS']);
    expect(result.edges.length).toBeGreaterThanOrEqual(1);
    expect(result.nodes.some(n => n.id === 'prod-001')).toBe(true);
    expect(result.degraded).toBe(false);
  });

  it('traverse empty start list returns degraded with warnings', () => {
    const gt = createGraphTraversal(store);
    const result = gt.traverse([], ['DEPLOYS']);
    expect(result.nodes.length).toBe(0);
    expect(result.degraded).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('traverse with no edge types returns degraded', () => {
    const gt = createGraphTraversal(store);
    const result = gt.traverse(['money-001'], []);
    expect(result.degraded).toBe(true);
  });

  it('traverse with no matching edges returns degraded', () => {
    const gt = createGraphTraversal(store);
    const result = gt.traverse(['money-001'], ['FUNDS']);
    expect(result.degraded).toBe(true);
  });

  // ═══ scanOutliers() ═══

  it('scanOutliers finds anomalous nodes with low threshold', () => {
    const gt = createGraphTraversal(store);
    const outliers = gt.scanOutliers('resource/money', 0.5);
    expect(outliers.length).toBeLessThanOrEqual(10);
    expect(outliers.every(o => o.deviation >= 0.5)).toBe(true);
  });

  it('scanOutliers returns empty for unknown type', () => {
    const gt = createGraphTraversal(store);
    const outliers = gt.scanOutliers('nonexistent/type', 3);
    expect(outliers.length).toBe(0);
  });

  // ═══ evaluateEdges() ═══

  it('evaluateEdges returns results for known edges', () => {
    const gt = createGraphTraversal(store);
    const evals = gt.evaluateEdges(['money-001'], ['DEPLOYS']);
    expect(Array.isArray(evals)).toBe(true);
    evals.forEach(e => {
      expect(e.anomalyScore).toBeGreaterThanOrEqual(0);
      expect(e.edgeId).toBeDefined();
    });
  });

  it('evaluateEdges returns empty for unknown edges', () => {
    const gt = createGraphTraversal(store);
    const evals = gt.evaluateEdges(['money-001'], ['UNKNOWN']);
    expect(evals.length).toBe(0);
  });

  // ═══ getTemporalParams() ═══

  it('getTemporalParams returns defaults', () => {
    const gt = createGraphTraversal(store);
    const params = gt.getTemporalParams('edge-001');
    expect(params.trend).toBe('stable');
    expect(typeof params.current).toBe('number');
  });
});
