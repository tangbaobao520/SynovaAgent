/**
 * tests/l4/edges/depends_on_platform.test.ts — DEPENDS_ON_PLATFORM 边集成测试
 *
 * allowedFrom: 8 activity types
 * allowedTo: outcome/competitive, outcome/market, outcome/risk
 * requiredProps: dependency_depth, platform_substitutability
 */
import { describe, it, expect } from 'vitest';
import { createGraphTraversal } from '../../../src/l4/graph-traversal';
import { validateEdgeEndpoints } from '../../../src/l4/ontology-loader';

function createDependsOnPlatformMockStore() {
  const nodes = [
    { id: 'prod-001', type: 'activity/production', props: { cycle_time_hours: 24 } },
    { id: 'comp-001', type: 'outcome/competitive', props: { market_share: 0.3 } },
  ];
  const edges = [
    { id: 'dop-001', type: 'DEPENDS_ON_PLATFORM', from: 'prod-001', to: 'comp-001', weight: 0.8, props: { dependency_depth: 0.7, platform_substitutability: 0.3, value_appropriation_right: 0.4 } },
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

describe('EDGE: DEPENDS_ON_PLATFORM', () => {
  it('正常路径: traverse DEPENDS_ON_PLATFORM 从production到competitive outcome', () => {
    const store = createDependsOnPlatformMockStore();
    const gt = createGraphTraversal(store);
    const result = gt.traverse(['prod-001'], ['DEPENDS_ON_PLATFORM']);
    expect(result.edges.length).toBeGreaterThanOrEqual(1);
    expect(result.edges[0].type).toBe('DEPENDS_ON_PLATFORM');
    expect(result.nodes.some(n => n.id === 'comp-001')).toBe(true);
    expect(result.edges[0].props.dependency_depth).toBe(0.7);
    expect(result.degraded).toBe(false);
  });

  it('降级路径: 无DEPENDS_ON_PLATFORM返回degraded', () => {
    const store = createDependsOnPlatformMockStore();
    const gt = createGraphTraversal(store);
    const result = gt.traverse(['comp-001'], ['DEPENDS_ON_PLATFORM']);
    expect(result.nodes.length).toBe(0);
    expect(result.degraded).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('端点验证: allowedFrom/To 正确', () => {
    expect(validateEdgeEndpoints('DEPENDS_ON_PLATFORM', 'activity/production', 'outcome/competitive')).toBe(true);
    expect(validateEdgeEndpoints('DEPENDS_ON_PLATFORM', 'activity/innovation', 'outcome/market')).toBe(true);
    expect(validateEdgeEndpoints('DEPENDS_ON_PLATFORM', 'resource/money', 'outcome/competitive')).toBe(false);
    expect(validateEdgeEndpoints('DEPENDS_ON_PLATFORM', 'activity/production', 'resource/money')).toBe(false);
  });
});
