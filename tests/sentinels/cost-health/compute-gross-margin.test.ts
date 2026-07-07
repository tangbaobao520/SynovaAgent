import { describe, it, expect } from 'vitest';
import { computeGrossMargin } from '../../../extensions/sentinels/cost-health/computes/compute-gross-margin';
import type { GraphStoreReader } from '../../../src/l4/graph-traversal';

function mockStore(nodes: Array<{ id: string; type: string; props: Record<string, unknown> }>): GraphStoreReader {
  return { queryNodes: () => nodes, queryEdges: () => [], getNode: () => null };
}

describe('computeGrossMargin', () => {
  it('should compute positive gross margin', async () => {
    const store = mockStore([
      { id: 'r1', type: 'Financial', props: { financialType: 'revenue', amount: 100000 } },
      { id: 'c1', type: 'Financial', props: { financialType: 'cost', amount: 60000 } },
    ]);
    const r = await computeGrossMargin(store, { teamId: 't1' });
    expect(r.degraded).toBe(false);
    expect(r.value).toBe(0.4); // (100k-60k)/100k
  });

  it('should degrade on empty data', async () => {
    const store = mockStore([]);
    const r = await computeGrossMargin(store, { teamId: 't1' });
    expect(r.degraded).toBe(true);
    expect(r.warnings.some(w => w.includes('无财务数据'))).toBe(true);
  });

  it('should handle zero revenue', async () => {
    const store = mockStore([
      { id: 'r1', type: 'Financial', props: { financialType: 'revenue', amount: 0 } },
      { id: 'c1', type: 'Financial', props: { financialType: 'cost', amount: 0 } },
    ]);
    const r = await computeGrossMargin(store, { teamId: 't1' });
    expect(r.degraded).toBe(false);
    expect(r.value).toBe(0);
  });
});
