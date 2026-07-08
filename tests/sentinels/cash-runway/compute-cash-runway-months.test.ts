import { describe, it, expect } from 'vitest';
import { computeCashRunwayMonths } from '../../../extensions/sentinels/cash-runway/computes/compute-cash-runway-months';
import type { GraphStoreReader } from '../../../src/l4/graph-traversal';

function createMockStore(nodes: Array<{ id: string; type: string; props: Record<string, unknown> }>): GraphStoreReader {
  return {
    queryNodes: () => nodes,
    queryEdges: () => [],
    getNode: () => null,
  };
}

describe('computeCashRunwayMonths', () => {
  it('should compute runway from traversal data', async () => {
    const store = createMockStore([]);
    const mockTraversal = {
      traverse: () => ({
        nodes: [{ id: 'fin1', type: 'Financial', props: { cash_balance: 120000, monthly_burn: 10000 } }],
        edges: [],
        path: ['fin1'],
        degraded: false,
        warnings: [],
      }),
    };
    const result = await computeCashRunwayMonths(store, { teamId: 'team1', traversal: mockTraversal as never });
    expect(result.degraded).toBe(false);
    expect(result.value).toBe(12); // 120000 / 10000 = 12 months
    expect(result.unit).toBe('个月');
    expect(result.evidence.length).toBeGreaterThan(0);
  });

  it('should degrade on empty data', async () => {
    const store = createMockStore([]);
    const result = await computeCashRunwayMonths(store, { teamId: 'empty-team' });
    expect(result.degraded).toBe(true);
    expect(result.value).toBe(0);
    expect(result.warnings.some(w => w.includes('无财务数据'))).toBe(true);
  });

  it('should handle Infinity runway (zero burn, positive cash)', async () => {
    const store = createMockStore([
      { id: 'fin1', type: 'Financial', props: { cashBalance: 50000, operatingExpenses: 0 } },
    ]);
    const result = await computeCashRunwayMonths(store, { teamId: 'team1' });
    expect(result.degraded).toBe(false);
    expect(result.value).toBe(Infinity);
  });

  it('should fallback to queryNodes when traversal fails', async () => {
    const store = createMockStore([
      { id: 'fin1', type: 'Financial', props: { cashBalance: 100000, amount: 20000 } },
    ]);
    const result = await computeCashRunwayMonths(store, { teamId: 'team1' });
    expect(result.degraded).toBe(false);
    expect(result.value).toBe(5); // 100000 / 20000 = 5
  });

  it('should handle exceptions gracefully', async () => {
    const brokenStore = {
      queryNodes: () => { throw new Error('DB down'); },
      queryEdges: () => { throw new Error('DB down'); },
      getNode: () => null,
    };
    const result = await computeCashRunwayMonths(brokenStore, { teamId: 'team1' });
    expect(result.degraded).toBe(true);
  });
});
