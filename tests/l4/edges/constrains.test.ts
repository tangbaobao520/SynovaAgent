/**
 * tests/l4/edges/constrains.test.ts — CONSTRAINS 边集成测试
 *
 * allowedFrom: outcome/external
 * allowedTo: 8 activity types
 * requiredProps: constraint_type, magnitude
 */
import { describe, it, expect } from 'vitest';
import { createGraphTraversal } from '../../../src/l4/graph-traversal';
import { validateEdgeEndpoints } from '../../../src/l4/ontology-loader';

function createConstrainsMockStore() {
  const nodes = [
    { id: 'ext-001', type: 'outcome/external', props: { regulatory_risk: 0.7, market_growth: 0.02 } },
    { id: 'prod-001', type: 'activity/production', props: { capacity_utilization: 0.8 } },
  ];
  const edges = [
    { id: 'con-001', type: 'CONSTRAINS', from: 'ext-001', to: 'prod-001', weight: 0.9, props: { constraint_type: 'regulatory', magnitude: 0.75, constraint_period: '2026-Q3', adaptation_required: 0.6 } },
  ];
  return {
    queryNodes: (type: string) => nodes.filter(n => n.type === type),
    queryEdges: (_t?: string, from?: string) => {
      let r = edges;
      if (from) r = r.filter(e => e.from === from);
      return r;
    },
    getNode: (id: string) => {
      const n = nodes.find(n => n.id === id);
      return n ? { id: n.id, type: n.type, props: n.props } : null;
    },
  };
}

describe('EDGE: CONSTRAINS', () => {
  it('正常路径: traverse CONSTRAINS 从external outcome到production', () => {
    const store = createConstrainsMockStore();
    const gt = createGraphTraversal(store);
    const result = gt.traverse(['ext-001'], ['CONSTRAINS']);
    expect(result.edges.length).toBeGreaterThanOrEqual(1);
    expect(result.edges[0].type).toBe('CONSTRAINS');
    expect(result.nodes.some(n => n.id === 'prod-001')).toBe(true);
    expect(result.edges[0].props.constraint_type).toBe('regulatory');
    expect(result.edges[0].props.magnitude).toBe(0.75);
    expect(result.degraded).toBe(false);
  });

  it('降级路径: 无CONSTRAINS返回degraded', () => {
    const store = createConstrainsMockStore();
    const gt = createGraphTraversal(store);
    const result = gt.traverse(['prod-001'], ['CONSTRAINS']);
    expect(result.nodes.length).toBe(0);
    expect(result.degraded).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('端点验证: allowedFrom/To 正确', () => {
    expect(validateEdgeEndpoints('CONSTRAINS', 'outcome/external', 'activity/production')).toBe(true);
    expect(validateEdgeEndpoints('CONSTRAINS', 'outcome/external', 'activity/innovation')).toBe(true);
    expect(validateEdgeEndpoints('CONSTRAINS', 'resource/money', 'activity/production')).toBe(false);
    expect(validateEdgeEndpoints('CONSTRAINS', 'outcome/external', 'resource/money')).toBe(false);
  });
});
