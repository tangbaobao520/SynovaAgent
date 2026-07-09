/**
 * tests/sentinels/cash-runway/compute-replenish-rate.test.ts
 *
 * 消费边: REPLENISHES
 * 测试: 正常路径 + 降级路径
 */
import { describe, it, expect } from 'vitest';
import { computeReplenishRate } from '../../../extensions/sentinels/cash-runway/computes/compute-replenish-rate';

function createMockStore(hasData: boolean) {
  const nodes = hasData ? [
    { id: 'fin-001', type: 'outcome/financial', props: { net_income: 1000000 } },
  ] : [];
  const edges = hasData ? [
    { id: 'rep-001', type: 'REPLENISHES', from: 'fin-001', to: 'money-001', weight: 0.6, props: { reinvestment_rate: 0.35 } },
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

describe('computeReplenishRate', () => {
  it('正常路径: 有REPLENISHES数据返回再投资率', async () => {
    const store = createMockStore(true);
    const traversal = {
      traverse: (_start: string[], _types: string[]) => ({
        nodes: [{ id: 'money-001', type: 'resource/money', props: {} }],
        edges: [{ id: 'rep-001', type: 'REPLENISHES', from: 'fin-001', to: 'money-001', weight: 0.6, props: { reinvestment_rate: 0.35 } }],
        path: [], degraded: false, warnings: [],
      }),
      getTemporalParams: () => ({ current: 0, window_3m: { mean: 0, slope: 0, variance: 0 }, window_12m: { mean: 0, slope: 0, variance: 0 }, trend: 'stable' as const }),
      scanOutliers: () => [],
      evaluateEdges: () => [],
    };
    const result = await computeReplenishRate(store, { teamId: 't1', traversal });
    expect(result.degraded).toBe(false);
    expect(result.value).toBe(0.35);
    expect(result.evidence.length).toBeGreaterThan(0);
  });

  it('降级路径: 无REPLENISHES数据返回degraded', async () => {
    const store = createMockStore(false);
    const result = await computeReplenishRate(store, { teamId: 't1' });
    expect(result.degraded).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.value).toBe(0);
  });
});
