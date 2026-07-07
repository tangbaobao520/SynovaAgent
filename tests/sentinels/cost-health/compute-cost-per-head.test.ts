import { describe, it, expect } from 'vitest';
import { computeCostPerHead } from '../../../extensions/sentinels/cost-health/computes/compute-cost-per-head';
import type { GraphStoreReader } from '../../../src/l4/graph-traversal';

function mockStore(finNodes: Array<{ id: string; type: string; props: Record<string, unknown> }>,
  personNodes?: Array<{ id: string; type: string; props: Record<string, unknown> }>): GraphStoreReader {
  let callCount = 0;
  return {
    queryNodes: (_type: string) => {
      callCount++;
      if (callCount === 1) return finNodes;
      return personNodes || [];
    },
    queryEdges: () => [],
    getNode: () => null,
  };
}

describe('computeCostPerHead', () => {
  it('should compute cost per head', async () => {
    const store = mockStore(
      [{ id: 'c1', type: 'Financial', props: { financialType: 'cost', amount: 500000 } }],
      [{ id: 'p1', type: 'Person', props: {} }, { id: 'p2', type: 'Person', props: {} }, { id: 'p3', type: 'Person', props: {} }, { id: 'p4', type: 'Person', props: {} }, { id: 'p5', type: 'Person', props: {} }],
    );
    const r = await computeCostPerHead(store, { teamId: 't1' });
    expect(r.degraded).toBe(false);
    expect(r.value).toBe(100000); // 500000/5
  });

  it('should degrade on empty data', async () => {
    const store = mockStore([], []);
    const r = await computeCostPerHead(store, { teamId: 't1' });
    expect(r.degraded).toBe(true);
  });

  it('should handle zero headcount', async () => {
    const store = mockStore(
      [{ id: 'c1', type: 'Financial', props: { financialType: 'cost', amount: 100000 } }],
      [],
    );
    const r = await computeCostPerHead(store, { teamId: 't1' });
    expect(r.degraded).toBe(false);
    expect(r.value).toBe(0);
  });
});
