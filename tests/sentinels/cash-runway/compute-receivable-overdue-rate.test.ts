import { describe, it, expect } from 'vitest';
import { computeReceivableOverdueRate } from '../../../extensions/sentinels/cash-runway/computes/compute-receivable-overdue-rate';
import type { GraphStoreReader } from '../../../src/l4/graph-traversal';

function createMockStore(nodes: Array<{ id: string; type: string; props: Record<string, unknown> }>): GraphStoreReader {
  return {
    queryNodes: () => nodes,
    queryEdges: () => [],
    getNode: () => null,
  };
}

describe('computeReceivableOverdueRate', () => {
  it('should compute overdue rate from traversal data', async () => {
    const store = createMockStore([]);
    const mockTraversal = {
      traverse: () => ({
        nodes: [{ id: 'fin1', type: 'Financial', props: { cash_balance: 100000, accounts_receivable: 25000 } }],
        edges: [],
        path: ['fin1'],
        degraded: false,
        warnings: [],
      }),
    };
    const result = await computeReceivableOverdueRate(store, { teamId: 'team1', traversal: mockTraversal as never });
    expect(result.degraded).toBe(false);
    expect(result.value).toBe(0.25); // 25000 / 100000
    expect(result.unit).toBe('比率');
  });

  it('should degrade on empty data', async () => {
    const store = createMockStore([]);
    const result = await computeReceivableOverdueRate(store, { teamId: 'empty-team' });
    expect(result.degraded).toBe(true);
    expect(result.value).toBe(0);
    expect(result.warnings.some(w => w.includes('无财务数据'))).toBe(true);
  });

  it('should handle zero cash', async () => {
    const store = createMockStore([
      { id: 'fin1', type: 'Financial', props: { cashBalance: 0, accountsReceivable: 5000 } },
    ]);
    const result = await computeReceivableOverdueRate(store, { teamId: 'team1' });
    expect(result.degraded).toBe(false);
    expect(result.value).toBe(0);
  });
});
