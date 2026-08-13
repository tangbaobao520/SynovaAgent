/**
 * tests/sentinels/cost-health/compute-incentive-bind.test.ts
 *
 * 消费边: INCENTIVE_BINDS
 * 测试: 正常路径 + 降级路径
 */
import { describe, it, expect } from 'vitest';
import { computeIncentiveBindGap } from '../../../extensions/sentinels/cost-health/computes/compute-incentive-bind';

function createMockStore(hasData: boolean) {
  const nodes = hasData ? [
    { id: 'gov-001', type: 'activity/governance', props: {} },
  ] : [];
  const edges = hasData ? [
    { id: 'ib-001', type: 'INCENTIVE_BINDS', from: 'gov-001', to: 'prod-001', weight: 0.6, props: { metric_behavior_gap: 0.45 } },
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

describe('computeIncentiveBindGap', () => {
  it('正常路径: 有INCENTIVE_BINDS数据返回行为差距', async () => {
    const store = createMockStore(true);
    const traversal = {
      traverse: (_start: string[], _types: string[]) => ({
        nodes: [{ id: 'prod-001', type: 'activity/production', props: {} }],
        edges: [{ id: 'ib-001', type: 'INCENTIVE_BINDS', from: 'gov-001', to: 'prod-001', weight: 0.6, props: { metric_behavior_gap: 0.45 } }],
        path: [], degraded: false, warnings: [],
      }),
      getTemporalParams: () => ({ current: 0, window_3m: { mean: 0, slope: 0, variance: 0 }, window_12m: { mean: 0, slope: 0, variance: 0 }, trend: 'stable' as const }),
      scanOutliers: () => [],
      evaluateEdges: () => [],
    };
    const result = await computeIncentiveBindGap(store, { teamId: 't1', traversal });
    expect(result.degraded).toBe(false);
    expect(result.value).toBe(0.45);
    expect(result.evidence.length).toBeGreaterThan(0);
  });

  it('降级路径: 无INCENTIVE_BINDS数据返回degraded', async () => {
    const store = createMockStore(false);
    const result = await computeIncentiveBindGap(store, { teamId: 't1' });
    expect(result.degraded).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.value).toBe(0);
  });
});
