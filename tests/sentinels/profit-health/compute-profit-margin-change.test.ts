import { describe, it, expect } from 'vitest';
import { computeProfitMarginChange } from '../../../extensions/sentinels/profit-health/computes/compute-profit-margin-change';
import type { GraphStoreReader } from '../../../src/l4/graph-traversal';

function mockStore(nodes: Array<{ id: string; type: string; props: Record<string, unknown> }>): GraphStoreReader {
  return { queryNodes: () => nodes, queryEdges: () => [], getNode: () => null };
}

describe('computeProfitMarginChange', () => {
  it('should compute positive profit margin', async () => {
    const store = mockStore([
      { id: 'r1', type: 'Financial', props: { financialType: 'revenue', amount: 200000 } },
      { id: 'c1', type: 'Financial', props: { financialType: 'cost', amount: 120000 } },
    ]);
    const r = await computeProfitMarginChange(store, { teamId: 't1' });
    expect(r.degraded).toBe(false);
    expect(r.value).toBe(0.4); // (200k-120k)/200k = 0.4
  });

  it('should degrade on empty data', async () => {
    const store = mockStore([]);
    const r = await computeProfitMarginChange(store, { teamId: 't1' });
    expect(r.degraded).toBe(true);
    expect(r.warnings.some(w => w.includes('无财务数据'))).toBe(true);
  });

  it('should handle negative profit margin (loss)', async () => {
    const store = mockStore([
      { id: 'r1', type: 'Financial', props: { financialType: 'revenue', amount: 100000 } },
      { id: 'c1', type: 'Financial', props: { financialType: 'cost', amount: 150000 } },
    ]);
    const r = await computeProfitMarginChange(store, { teamId: 't1' });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeLessThan(0);
    expect(r.value).toBe(-0.5);
  });
});
