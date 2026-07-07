import { describe, it, expect } from 'vitest';
import { computeRevenueGrowth } from '../../../extensions/sentinels/revenue-health/computes/compute-revenue-growth';
import type { GraphStoreReader } from '../../../src/l4/graph-traversal';

function mockStore(nodes: Array<{ id: string; type: string; props: Record<string, unknown> }>): GraphStoreReader {
  return { queryNodes: () => nodes, queryEdges: () => [], getNode: () => null };
}

describe('computeRevenueGrowth', () => {
  it('should compute growth as ratio of two-period data', async () => {
    // Original formula: totalRevenue = SUM(all), prev = second-to-last node
    // With 2 nodes: growth = n1/n0
    const store = mockStore([
      { id: 'r1', type: 'Financial', props: { financialType: 'revenue', amount: 100000 } },
      { id: 'r2', type: 'Financial', props: { financialType: 'revenue', amount: 20000 } },
    ]);
    const r = await computeRevenueGrowth(store, { teamId: 't1' });
    expect(r.degraded).toBe(false);
    expect(r.value).toBe(0.2); // 20000/100000
    expect(r.totalRevenue).toBe(120000);
    expect(r.previousRevenue).toBe(100000);
  });

  it('should degrade on empty data', async () => {
    const store = mockStore([]);
    const r = await computeRevenueGrowth(store, { teamId: 't1' });
    expect(r.degraded).toBe(true);
    expect(r.warnings.some(w => w.includes('无收入数据'))).toBe(true);
  });

  it('should handle single period data (zero growth)', async () => {
    const store = mockStore([
      { id: 'r1', type: 'Financial', props: { financialType: 'revenue', amount: 100000 } },
    ]);
    const r = await computeRevenueGrowth(store, { teamId: 't1' });
    expect(r.degraded).toBe(false);
    expect(r.value).toBe(0);
    expect(r.confidence).toBe('medium');
  });

  it('should handle declining revenue between periods', async () => {
    // n1/n0 = 20000/100000 = 0.2 < previous value = decline in growth rate
    const store = mockStore([
      { id: 'r1', type: 'Financial', props: { financialType: 'revenue', amount: 50000 } },
      { id: 'r2', type: 'Financial', props: { financialType: 'revenue', amount: 5000 } },
    ]);
    const r = await computeRevenueGrowth(store, { teamId: 't1' });
    expect(r.degraded).toBe(false);
    expect(r.value).toBe(0.1); // 5000/50000
  });

  it('should handle zero previous revenue', async () => {
    const store = mockStore([
      { id: 'r1', type: 'Financial', props: { financialType: 'revenue', amount: 0 } },
      { id: 'r2', type: 'Financial', props: { financialType: 'revenue', amount: 100000 } },
    ]);
    const r = await computeRevenueGrowth(store, { teamId: 't1' });
    expect(r.degraded).toBe(false);
    expect(r.value).toBe(0); // prev=0 → growth=0
  });
});
