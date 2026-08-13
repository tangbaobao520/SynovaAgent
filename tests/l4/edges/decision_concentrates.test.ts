/**
 * tests/l4/edges/decision_concentrates.test.ts — DECISION_CONCENTRATES 边集成测试
 *
 * allowedFrom: activity/governance, activity/coordination
 * allowedTo: activity/learning, activity/maintenance, activity/innovation
 * requiredProps: concentration_index, reversal_cost
 */
import { describe, it, expect } from 'vitest';
import { createGraphTraversal } from '../../../src/l4/graph-traversal';
import { validateEdgeEndpoints } from '../../../src/l4/ontology-loader';

function createDecisionConcentratesMockStore() {
  const nodes = [
    { id: 'gov-001', type: 'activity/governance', props: { board_meetings: 12 } },
    { id: 'learn-001', type: 'activity/learning', props: { training_hours: 500 } },
  ];
  const edges = [
    { id: 'dc-001', type: 'DECISION_CONCENTRATES', from: 'gov-001', to: 'learn-001', weight: 0.9, props: { concentration_index: 0.85, reversal_cost: 200000, independent_oversight_ratio: 0.3 } },
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

describe('EDGE: DECISION_CONCENTRATES', () => {
  it('正常路径: traverse DECISION_CONCENTRATES 从governance到learning', () => {
    const store = createDecisionConcentratesMockStore();
    const gt = createGraphTraversal(store);
    const result = gt.traverse(['gov-001'], ['DECISION_CONCENTRATES']);
    expect(result.edges.length).toBeGreaterThanOrEqual(1);
    expect(result.edges[0].type).toBe('DECISION_CONCENTRATES');
    expect(result.nodes.some(n => n.id === 'learn-001')).toBe(true);
    expect(result.edges[0].props.concentration_index).toBe(0.85);
    expect(result.degraded).toBe(false);
  });

  it('降级路径: 无DECISION_CONCENTRATES返回degraded', () => {
    const store = createDecisionConcentratesMockStore();
    const gt = createGraphTraversal(store);
    const result = gt.traverse(['learn-001'], ['DECISION_CONCENTRATES']);
    expect(result.nodes.length).toBe(0);
    expect(result.degraded).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('端点验证: allowedFrom/To 正确', () => {
    expect(validateEdgeEndpoints('DECISION_CONCENTRATES', 'activity/governance', 'activity/learning')).toBe(true);
    expect(validateEdgeEndpoints('DECISION_CONCENTRATES', 'activity/coordination', 'activity/innovation')).toBe(true);
    expect(validateEdgeEndpoints('DECISION_CONCENTRATES', 'resource/money', 'activity/learning')).toBe(false);
    expect(validateEdgeEndpoints('DECISION_CONCENTRATES', 'activity/governance', 'activity/production')).toBe(false);
  });
});
