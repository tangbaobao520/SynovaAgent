/**
 * tests/sentinels/profit-health/compute-metric-bind-divergence.test.ts
 *
 * 消费边: METRIC_BINDS
 * 测试: 正常路径 + 降级路径
 */
import { describe, it, expect } from 'vitest';
import { computeMetricBindDivergence } from '../../../extensions/sentinels/profit-health/computes/compute-metric-bind-divergence';

function createMockStore(hasData: boolean) {
  const nodes = hasData ? [
    { id: 'gov-001', type: 'activity/governance', props: {} },
  ] : [];
  const edges = hasData ? [
    { id: 'mb-001', type: 'METRIC_BINDS', from: 'gov-001', to: 'money-001', weight: 0.8, props: { divergence_from_cash: 0.35, metric_type: 'CustomAdj' } },
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

describe('computeMetricBindDivergence', () => {
  it('正常路径: 有METRIC_BINDS数据返回偏离度', async () => {
    const store = createMockStore(true);
    const traversal = {
      traverse: (_start: string[], _types: string[]) => ({
        nodes: [{ id: 'money-001', type: 'resource/money', props: {} }],
        edges: [{ id: 'mb-001', type: 'METRIC_BINDS', from: 'gov-001', to: 'money-001', weight: 0.8, props: { divergence_from_cash: 0.35, metric_type: 'CustomAdj' } }],
        path: [], degraded: false, warnings: [],
      }),
      getTemporalParams: () => ({ current: 0, window_3m: { mean: 0, slope: 0, variance: 0 }, window_12m: { mean: 0, slope: 0, variance: 0 }, trend: 'stable' as const }),
      scanOutliers: () => [],
      evaluateEdges: () => [],
    };
    const result = await computeMetricBindDivergence(store, { teamId: 't1', traversal });
    expect(result.degraded).toBe(false);
    expect(result.value).toBe(0.35);
    expect(result.evidence.length).toBeGreaterThan(0);
  });

  it('降级路径: 无METRIC_BINDS数据返回degraded', async () => {
    const store = createMockStore(false);
    const result = await computeMetricBindDivergence(store, { teamId: 't1' });
    expect(result.degraded).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.value).toBe(0);
  });
});
