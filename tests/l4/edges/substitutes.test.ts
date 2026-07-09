/**
 * tests/l4/edges/substitutes.test.ts — SUBSTITUTES 边集成测试
 *
 * 契约: edge/substitutes
 * allowedFrom: activity/production, acquisition, innovation, coordination, learning, governance, maintenance, compliance
 * allowedTo: same 8 activity types
 * requiredProps: substitution_rate
 */
import { describe, it, expect } from 'vitest';
import { createGraphTraversal } from '../../../src/l4/graph-traversal';
import { validateEdgeEndpoints } from '../../../src/l4/ontology-loader';

function createSubstitutesMockStore() {
  const nodes = [
    { id: 'act-001', type: 'activity/production', props: { cycle_time_hours: 24 } },
    { id: 'act-002', type: 'activity/innovation', props: { r_d_spend: 500000 } },
    { id: 'act-003', type: 'activity/coordination', props: { meeting_hours: 100 } },
  ];
  const edges = [
    { id: 'sub-001', type: 'SUBSTITUTES', from: 'act-002', to: 'act-001', weight: 0.7, props: { substitution_rate: 0.4, switching_cost: 50000, quality_differential: 0.2 } },
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

describe('EDGE: SUBSTITUTES', () => {
  it('正常路径: traverse SUBSTITUTES 从innovation找到production', () => {
    const store = createSubstitutesMockStore();
    const gt = createGraphTraversal(store);
    const result = gt.traverse(['act-002'], ['SUBSTITUTES']);
    expect(result.edges.length).toBeGreaterThanOrEqual(1);
    expect(result.edges[0].type).toBe('SUBSTITUTES');
    expect(result.nodes.some(n => n.id === 'act-001')).toBe(true);
    expect(result.edges[0].props.substitution_rate).toBe(0.4);
    expect(result.degraded).toBe(false);
  });

  it('降级路径: 无SUBSTITUTES数据返回degraded', () => {
    const store = createSubstitutesMockStore();
    const gt = createGraphTraversal(store);
    const result = gt.traverse(['act-003'], ['SUBSTITUTES']);
    expect(result.nodes.length).toBe(0);
    expect(result.degraded).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('端点验证: allowedFrom/To 正确', () => {
    expect(validateEdgeEndpoints('SUBSTITUTES', 'activity/production', 'activity/innovation')).toBe(true);
    expect(validateEdgeEndpoints('SUBSTITUTES', 'activity/production', 'activity/production')).toBe(true);
    expect(validateEdgeEndpoints('SUBSTITUTES', 'resource/money', 'activity/production')).toBe(false);
    expect(validateEdgeEndpoints('SUBSTITUTES', 'activity/production', 'outcome/financial')).toBe(false);
  });
});
