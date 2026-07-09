/**
 * tests/l4/edges/external_assumption.test.ts — EXTERNAL_ASSUMPTION_BINDS 边集成测试
 *
 * allowedFrom: activity/governance, activity/production, activity/acquisition
 * allowedTo: outcome/external
 * requiredProps: exogenous_dependency_count, counterfactual_test_exists
 * Note: Schema文件名 external_assumption.json (无 binds 后缀)
 */
import { describe, it, expect } from 'vitest';
import { createGraphTraversal } from '../../../src/l4/graph-traversal';
import { validateEdgeEndpoints } from '../../../src/l4/ontology-loader';

function createExternalAssumptionMockStore() {
  const nodes = [
    { id: 'gov-001', type: 'activity/governance', props: { board_meetings: 12 } },
    { id: 'ext-001', type: 'outcome/external', props: { market_growth: 0.05, regulatory_risk: 0.3 } },
  ];
  const edges = [
    { id: 'ea-001', type: 'EXTERNAL_ASSUMPTION_BINDS', from: 'gov-001', to: 'ext-001', weight: 0.8, props: { exogenous_dependency_count: 3, counterfactual_test_exists: 1, single_channel_concentration: 0.6 } },
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

describe('EDGE: EXTERNAL_ASSUMPTION_BINDS', () => {
  it('正常路径: traverse EXTERNAL_ASSUMPTION_BINDS 从governance到external outcome', () => {
    const store = createExternalAssumptionMockStore();
    const gt = createGraphTraversal(store);
    const result = gt.traverse(['gov-001'], ['EXTERNAL_ASSUMPTION_BINDS']);
    expect(result.edges.length).toBeGreaterThanOrEqual(1);
    expect(result.edges[0].type).toBe('EXTERNAL_ASSUMPTION_BINDS');
    expect(result.nodes.some(n => n.id === 'ext-001')).toBe(true);
    expect(result.edges[0].props.exogenous_dependency_count).toBe(3);
    expect(result.degraded).toBe(false);
  });

  it('降级路径: 无EXTERNAL_ASSUMPTION_BINDS返回degraded', () => {
    const store = createExternalAssumptionMockStore();
    const gt = createGraphTraversal(store);
    const result = gt.traverse(['ext-001'], ['EXTERNAL_ASSUMPTION_BINDS']);
    expect(result.nodes.length).toBe(0);
    expect(result.degraded).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('端点验证: allowedFrom/To 正确', () => {
    expect(validateEdgeEndpoints('EXTERNAL_ASSUMPTION_BINDS', 'activity/governance', 'outcome/external')).toBe(true);
    expect(validateEdgeEndpoints('EXTERNAL_ASSUMPTION_BINDS', 'activity/production', 'outcome/external')).toBe(true);
    expect(validateEdgeEndpoints('EXTERNAL_ASSUMPTION_BINDS', 'resource/money', 'outcome/external')).toBe(false);
    expect(validateEdgeEndpoints('EXTERNAL_ASSUMPTION_BINDS', 'activity/governance', 'resource/money')).toBe(false);
  });
});
