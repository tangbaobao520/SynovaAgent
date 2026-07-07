import { describe, it, expect } from 'vitest';
import { computeMarginVsBenchmark } from '../../../extensions/sentinels/profit-health/computes/compute-margin-vs-benchmark';
import type { GraphStoreReader } from '../../../src/l4/graph-traversal';

function mockStore(nodes: Array<{ id: string; type: string; props: Record<string, unknown> }>): GraphStoreReader {
  return { queryNodes: () => nodes, queryEdges: () => [], getNode: () => null };
}

describe('computeMarginVsBenchmark', () => {
  it('should compute gap vs default benchmark (25%)', async () => {
    const store = mockStore([
      { id: 'r1', type: 'Financial', props: { financialType: 'revenue', amount: 200000 } },
      { id: 'c1', type: 'Financial', props: { financialType: 'cost', amount: 120000 } },
    ]);
    const r = await computeMarginVsBenchmark(store, { teamId: 't1' });
    expect(r.degraded).toBe(false);
    expect(r.profitMargin).toBe(0.4);
    expect(r.gap).toBe(0.15); // 0.4 - 0.25 = 0.15
  });

  it('should compute with custom benchmark', async () => {
    const store = mockStore([
      { id: 'r1', type: 'Financial', props: { financialType: 'revenue', amount: 100000 } },
      { id: 'c1', type: 'Financial', props: { financialType: 'cost', amount: 90000 } },
    ]);
    const r = await computeMarginVsBenchmark(store, { teamId: 't1', benchmark: 0.15 });
    expect(r.degraded).toBe(false);
    expect(r.profitMargin).toBe(0.1);
    expect(r.gap).toBe(-0.05);
  });

  it('should degrade on empty data', async () => {
    const store = mockStore([]);
    const r = await computeMarginVsBenchmark(store, { teamId: 't1' });
    expect(r.degraded).toBe(true);
    expect(r.gap).toBeLessThan(0);
  });
});
