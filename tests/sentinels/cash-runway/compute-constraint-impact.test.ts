/**
 * tests/sentinels/cash-runway/compute-constraint-impact.test.ts
 *
 * 消费边: CONSTRAINS
 * 测试: 正常路径 + 降级路径
 */
import { describe, it, expect } from 'vitest';
import { computeConstraintImpact } from '../../../extensions/sentinels/cash-runway/computes/compute-constraint-impact';

function createMockStore(hasData: boolean) {
  const nodes = hasData ? [
    { id: 'ext-001', type: 'outcome/external', props: { regulatory_risk: 0.7 } },
  ] : [];
  const edges = hasData ? [
    { id: 'con-001', type: 'CONSTRAINS', from: 'ext-001', to: 'prod-001', weight: 0.9, props: { constraint_type: 'regulatory', magnitude: 0.75 } },
  ] : [];
  return {
    queryNodes: () => nodes,
    queryEdges: (_t?: string, from?: string) => from ? edges.filter(e => e.from === from) : edges,
    getNode: (id: string) => {
      const n = nodes.find(n => n.id === id);
      return n ? { id: n.id, type: n.type, props: n.props } : null;
    },
  };
}

describe('computeConstraintImpact', () => {
  it('正常路径: 有CONSTRAINS数据返回magnitude', async () => {
    const store = createMockStore(true);
    const traversal = {
      traverse: (_start: string[], _types: string[]) => ({
        nodes: [{ id: 'prod-001', type: 'activity/production', props: {} }],
        edges: [{ id: 'con-001', type: 'CONSTRAINS', from: 'ext-001', to: 'prod-001', weight: 0.9, props: { constraint_type: 'regulatory', magnitude: 0.75 } }],
        path: [], degraded: false, warnings: [],
      }),
      getTemporalParams: () => ({ current: 0, window_3m: { mean: 0, slope: 0, variance: 0 }, window_12m: { mean: 0, slope: 0, variance: 0 }, trend: 'stable' as const }),
      scanOutliers: () => [],
      evaluateEdges: () => [],
    };
    const result = await computeConstraintImpact(store, { teamId: 't1', traversal });
    expect(result.degraded).toBe(false);
    expect(result.value).toBeGreaterThan(0);
    expect(result.evidence.length).toBeGreaterThan(0);
  });

  it('降级路径: 无CONSTRAINS数据返回degraded', async () => {
    const store = createMockStore(false);
    const result = await computeConstraintImpact(store, { teamId: 't1' });
    expect(result.degraded).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.value).toBe(0);
  });
});
