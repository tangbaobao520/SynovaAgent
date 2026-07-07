import { describe, it, expect } from 'vitest';
import { computeFixedVariableRatio } from '../../../extensions/sentinels/cost-health/computes/compute-fixed-variable-ratio';
import type { GraphStoreReader } from '../../../src/l4/graph-traversal';

function mockStore(nodes: Array<{ id: string; type: string; props: Record<string, unknown> }>): GraphStoreReader {
  return { queryNodes: () => nodes, queryEdges: () => [], getNode: () => null };
}

describe('computeFixedVariableRatio', () => {
  it('should compute fixed ratio correctly', async () => {
    const store = mockStore([
      { id: 'c1', type: 'Financial', props: { financialType: 'cost', amount: 100000, fixedAmount: 70000 } },
    ]);
    const r = await computeFixedVariableRatio(store, { teamId: 't1' });
    expect(r.degraded).toBe(false);
    expect(r.value).toBe(0.7); // 70000/100000
  });

  it('should degrade on empty data', async () => {
    const store = mockStore([]);
    const r = await computeFixedVariableRatio(store, { teamId: 't1' });
    expect(r.degraded).toBe(true);
  });

  it('should handle zero total cost', async () => {
    const store = mockStore([
      { id: 'c1', type: 'Financial', props: { financialType: 'cost', amount: 0, fixedAmount: 0 } },
    ]);
    const r = await computeFixedVariableRatio(store, { teamId: 't1' });
    expect(r.degraded).toBe(false);
    expect(r.value).toBe(0);
  });
});
