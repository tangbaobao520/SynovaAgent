/**
 * tests/l4/edges/replenishes.test.ts — REPLENISHES 边集成测试
 *
 * allowedFrom: outcome/financial, market, operational, people, innovation, competitive
 * allowedTo: resource/money, person, team, knowledge, client, brand, data
 * requiredProps: reinvestment_rate
 */
import { describe, it, expect } from 'vitest';
import { createGraphTraversal } from '../../../src/l4/graph-traversal';
import { validateEdgeEndpoints } from '../../../src/l4/ontology-loader';

function createReplenishesMockStore() {
  const nodes = [
    { id: 'fin-001', type: 'outcome/financial', props: { net_income: 1000000 } },
    { id: 'money-001', type: 'resource/money', props: { cash_balance: 500000 } },
  ];
  const edges = [
    { id: 'rep-001', type: 'REPLENISHES', from: 'fin-001', to: 'money-001', weight: 0.6, props: { reinvestment_rate: 0.35, amount: 350000, retention_rate: 0.9, compounding_factor: 1.05 } },
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

describe('EDGE: REPLENISHES', () => {
  it('正常路径: traverse REPLENISHES 从financial到money', () => {
    const store = createReplenishesMockStore();
    const gt = createGraphTraversal(store);
    const result = gt.traverse(['fin-001'], ['REPLENISHES']);
    expect(result.edges.length).toBeGreaterThanOrEqual(1);
    expect(result.edges[0].type).toBe('REPLENISHES');
    expect(result.nodes.some(n => n.id === 'money-001')).toBe(true);
    expect(result.edges[0].props.reinvestment_rate).toBe(0.35);
    expect(result.degraded).toBe(false);
  });

  it('降级路径: 无REPLENISHES返回degraded', () => {
    const store = createReplenishesMockStore();
    const gt = createGraphTraversal(store);
    const result = gt.traverse(['money-001'], ['REPLENISHES']);
    expect(result.nodes.length).toBe(0);
    expect(result.degraded).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('端点验证: allowedFrom/To 正确', () => {
    expect(validateEdgeEndpoints('REPLENISHES', 'outcome/financial', 'resource/money')).toBe(true);
    expect(validateEdgeEndpoints('REPLENISHES', 'outcome/market', 'resource/client')).toBe(true);
    expect(validateEdgeEndpoints('REPLENISHES', 'resource/money', 'outcome/financial')).toBe(false);
    expect(validateEdgeEndpoints('REPLENISHES', 'outcome/financial', 'activity/production')).toBe(false);
  });
});
