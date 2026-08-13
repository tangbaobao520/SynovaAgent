/**
 * tests/l4/edges/locks_in.test.ts — LOCKS_IN 边集成测试
 *
 * allowedFrom: resource/tool, knowledge, brand, ip, data, client, supplier
 * allowedTo: resource/client, person, team
 * requiredProps: lock_in_strength, lock_type
 */
import { describe, it, expect } from 'vitest';
import { createGraphTraversal } from '../../../src/l4/graph-traversal';
import { validateEdgeEndpoints } from '../../../src/l4/ontology-loader';

function createLocksInMockStore() {
  const nodes = [
    { id: 'client-001', type: 'resource/client', props: { name: 'Acme Corp', revenue: 500000 } },
    { id: 'client-002', type: 'resource/client', props: { name: 'Beta Inc', revenue: 300000 } },
  ];
  const edges = [
    { id: 'li-001', type: 'LOCKS_IN', from: 'client-001', to: 'client-002', weight: 0.7, props: { lock_in_strength: 0.85, lock_type: 'contractual', switching_cost_created: 150000, lock_durability_years: 3 } },
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

describe('EDGE: LOCKS_IN', () => {
  it('正常路径: traverse LOCKS_IN 从client到client', () => {
    const store = createLocksInMockStore();
    const gt = createGraphTraversal(store);
    const result = gt.traverse(['client-001'], ['LOCKS_IN']);
    expect(result.edges.length).toBeGreaterThanOrEqual(1);
    expect(result.edges[0].type).toBe('LOCKS_IN');
    expect(result.nodes.some(n => n.id === 'client-002')).toBe(true);
    expect(result.edges[0].props.lock_in_strength).toBe(0.85);
    expect(result.degraded).toBe(false);
  });

  it('降级路径: 无LOCKS_IN返回degraded', () => {
    const store = createLocksInMockStore();
    const gt = createGraphTraversal(store);
    const result = gt.traverse(['client-002'], ['LOCKS_IN']);
    expect(result.nodes.length).toBe(0);
    expect(result.degraded).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('端点验证: allowedFrom/To 正确', () => {
    expect(validateEdgeEndpoints('LOCKS_IN', 'resource/client', 'resource/client')).toBe(true);
    expect(validateEdgeEndpoints('LOCKS_IN', 'resource/tool', 'resource/team')).toBe(true);
    expect(validateEdgeEndpoints('LOCKS_IN', 'resource/money', 'resource/client')).toBe(false);
    expect(validateEdgeEndpoints('LOCKS_IN', 'resource/client', 'activity/production')).toBe(false);
  });
});
