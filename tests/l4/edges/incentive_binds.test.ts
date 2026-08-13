/**
 * tests/l4/edges/incentive_binds.test.ts — INCENTIVE_BINDS 边集成测试
 *
 * allowedFrom: activity/governance
 * allowedTo: 6 activity types (production, acquisition, innovation, coordination, learning, maintenance)
 * requiredProps: metric_behavior_gap, risk_horizon_mismatch
 */
import { describe, it, expect } from 'vitest';
import { createGraphTraversal } from '../../../src/l4/graph-traversal';
import { validateEdgeEndpoints } from '../../../src/l4/ontology-loader';

function createIncentiveBindsMockStore() {
  const nodes = [
    { id: 'gov-001', type: 'activity/governance', props: { board_meetings: 12 } },
    { id: 'prod-001', type: 'activity/production', props: { output_units: 1000 } },
  ];
  const edges = [
    { id: 'ib-001', type: 'INCENTIVE_BINDS', from: 'gov-001', to: 'prod-001', weight: 0.6, props: { metric_behavior_gap: 0.45, risk_horizon_mismatch: 0.3, perverse_incentive_score: 0.5 } },
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

describe('EDGE: INCENTIVE_BINDS', () => {
  it('正常路径: traverse INCENTIVE_BINDS 从governance到production', () => {
    const store = createIncentiveBindsMockStore();
    const gt = createGraphTraversal(store);
    const result = gt.traverse(['gov-001'], ['INCENTIVE_BINDS']);
    expect(result.edges.length).toBeGreaterThanOrEqual(1);
    expect(result.edges[0].type).toBe('INCENTIVE_BINDS');
    expect(result.nodes.some(n => n.id === 'prod-001')).toBe(true);
    expect(result.edges[0].props.metric_behavior_gap).toBe(0.45);
    expect(result.degraded).toBe(false);
  });

  it('降级路径: 无INCENTIVE_BINDS返回degraded', () => {
    const store = createIncentiveBindsMockStore();
    const gt = createGraphTraversal(store);
    const result = gt.traverse(['prod-001'], ['INCENTIVE_BINDS']);
    expect(result.nodes.length).toBe(0);
    expect(result.degraded).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('端点验证: allowedFrom/To 正确', () => {
    expect(validateEdgeEndpoints('INCENTIVE_BINDS', 'activity/governance', 'activity/production')).toBe(true);
    expect(validateEdgeEndpoints('INCENTIVE_BINDS', 'activity/governance', 'activity/coordination')).toBe(true);
    expect(validateEdgeEndpoints('INCENTIVE_BINDS', 'activity/production', 'activity/governance')).toBe(false);
    expect(validateEdgeEndpoints('INCENTIVE_BINDS', 'activity/governance', 'outcome/financial')).toBe(false);
  });
});
