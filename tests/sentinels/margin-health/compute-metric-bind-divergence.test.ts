/**
 * tests/sentinels/margin-health/compute-metric-bind-divergence.test.ts — D358 配对测试（组 2b）
 *
 * 契约: computeMetricBindDivergence(store, input: {teamId, traversal?})
 *   保持 store-based（数据源 = METRIC_BINDS 边 props，非 Financial 节点，归一化不适用）
 *   正常: value = max(divergence_from_cash)（0-1）
 *   降级: 无边 / 遍历失败 → degraded
 *   边界: divergence 显式 0 → value 0 但不降级
 */
import { describe, it, expect } from 'vitest';
import type { GraphTraversal } from '../../../src/l4/graph-traversal';
import { computeMetricBindDivergence } from '../../../extensions/sentinels/margin-health/computes/compute-metric-bind-divergence';

function traversalWith(edges: Array<{ props: Record<string, unknown> }>) {
  return {
    traverse: () => ({ nodes: [], edges }),
  } as unknown as GraphTraversal;
}

describe('D358 compute-metric-bind-divergence（迁自 _extinct/profit-health，store-based 保持）', () => {
  it('正常: 取最大 divergence（0.6 与 0.35 → 0.6）', async () => {
    const r = await computeMetricBindDivergence({ queryNodes: () => [] }, {
      teamId: 't1',
      traversal: traversalWith([
        { props: { divergence_from_cash: 0.6, metric_type: 'revenue' } },
        { props: { divergence_from_cash: 0.35, metric_type: 'profit' } },
      ]),
    });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeCloseTo(0.6, 2);
    expect(r.evidence.some(e => e.includes('revenue'))).toBe(true);
  });

  it('降级: 无边 → degraded', async () => {
    const r = await computeMetricBindDivergence({ queryNodes: () => [] }, {
      teamId: 't1',
      traversal: traversalWith([]),
    });
    expect(r.degraded).toBe(true);
    expect(r.value).toBe(0);
  });

  it('边界: divergence 显式 0 → value 0 但不降级（数据存在）', async () => {
    const r = await computeMetricBindDivergence({ queryNodes: () => [] }, {
      teamId: 't1',
      traversal: traversalWith([{ props: { divergence_from_cash: 0 } }]),
    });
    expect(r.degraded).toBe(false);
    expect(r.value).toBe(0);
  });
});
