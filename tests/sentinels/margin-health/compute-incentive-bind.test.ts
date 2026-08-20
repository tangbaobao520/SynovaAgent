/**
 * tests/sentinels/margin-health/compute-incentive-bind.test.ts — D358 配对测试（组 2b）
 *
 * 契约: computeIncentiveBindGap(store, input: {teamId, traversal?})
 *   保持 store-based（数据源 = INCENTIVE_BINDS 边 props，非 Financial 节点，归一化不适用）
 *   正常: value = max(metric_behavior_gap)（0-1）
 *   降级: 无边 / 遍历失败 → degraded
 *   边界: gap 显式 0 的边计入（value=0 但发现数据）
 */
import { describe, it, expect } from 'vitest';
import type { GraphTraversal } from '../../../src/l4/graph-traversal';
import { computeIncentiveBindGap } from '../../../extensions/sentinels/margin-health/computes/compute-incentive-bind';

function traversalWith(edges: Array<{ props: Record<string, unknown> }>) {
  return {
    traverse: () => ({ nodes: [], edges }),
  } as unknown as GraphTraversal;
}

describe('D358 compute-incentive-bind（迁自 _extinct/cost-health，store-based 保持）', () => {
  it('正常: 取最大 gap（0.45 与 0.2 → 0.45）', async () => {
    const r = await computeIncentiveBindGap({ queryNodes: () => [] }, {
      teamId: 't1',
      traversal: traversalWith([
        { props: { metric_behavior_gap: 0.45 } },
        { props: { metric_behavior_gap: 0.2 } },
      ]),
    });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeCloseTo(0.45, 2);
  });

  it('降级: 无边 → degraded', async () => {
    const r = await computeIncentiveBindGap({ queryNodes: () => [] }, {
      teamId: 't1',
      traversal: traversalWith([]),
    });
    expect(r.degraded).toBe(true);
    expect(r.value).toBe(0);
  });

  it('边界: gap 显式 0 的边 → value 0 但不降级（数据存在）', async () => {
    const r = await computeIncentiveBindGap({ queryNodes: () => [] }, {
      teamId: 't1',
      traversal: traversalWith([{ props: { metric_behavior_gap: 0 } }]),
    });
    expect(r.degraded).toBe(false);
    expect(r.value).toBe(0);
  });
});
