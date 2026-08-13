/**
 * tests/l4/edges/metric_binds.test.ts — METRIC_BINDS 边集成测试
 *
 * allowedFrom: activity/governance, activity/learning
 * allowedTo: resource/money, person, team, client, data + 7 activity types
 * requiredProps: divergence_from_cash, self_referentiality
 */
import { describe, it, expect } from 'vitest';
import { createGraphTraversal } from '../../../src/l4/graph-traversal';
import { validateEdgeEndpoints } from '../../../src/l4/ontology-loader';

function createMetricBindsMockStore() {
  const nodes = [
    { id: 'gov-001', type: 'activity/governance', props: { board_meetings: 12 } },
    { id: 'money-001', type: 'resource/money', props: { cash_balance: 500000 } },
  ];
  const edges = [
    { id: 'mb-001', type: 'METRIC_BINDS', from: 'gov-001', to: 'money-001', weight: 0.8, props: { divergence_from_cash: 0.35, self_referentiality: 0.2, metric_type: 'CustomAdj', gaming_susceptibility: 0.4 } },
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

describe('EDGE: METRIC_BINDS', () => {
  it('正常路径: traverse METRIC_BINDS 从governance到money', () => {
    const store = createMetricBindsMockStore();
    const gt = createGraphTraversal(store);
    const result = gt.traverse(['gov-001'], ['METRIC_BINDS']);
    expect(result.edges.length).toBeGreaterThanOrEqual(1);
    expect(result.edges[0].type).toBe('METRIC_BINDS');
    expect(result.nodes.some(n => n.id === 'money-001')).toBe(true);
    expect(result.edges[0].props.divergence_from_cash).toBe(0.35);
    expect(result.degraded).toBe(false);
  });

  it('降级路径: 无METRIC_BINDS返回degraded', () => {
    const store = createMetricBindsMockStore();
    const gt = createGraphTraversal(store);
    const result = gt.traverse(['money-001'], ['METRIC_BINDS']);
    expect(result.nodes.length).toBe(0);
    expect(result.degraded).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('端点验证: allowedFrom/To 正确', () => {
    expect(validateEdgeEndpoints('METRIC_BINDS', 'activity/governance', 'resource/money')).toBe(true);
    expect(validateEdgeEndpoints('METRIC_BINDS', 'activity/learning', 'activity/production')).toBe(true);
    expect(validateEdgeEndpoints('METRIC_BINDS', 'resource/money', 'activity/governance')).toBe(false);
    expect(validateEdgeEndpoints('METRIC_BINDS', 'activity/governance', 'outcome/external')).toBe(false);
  });
});
