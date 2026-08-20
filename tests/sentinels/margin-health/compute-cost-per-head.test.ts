/**
 * tests/sentinels/margin-health/compute-cost-per-head.test.ts — D358 配对测试（组 2b）
 *
 * 契约: computeCostPerHead(input: {total_cost, head_count})
 *   数据获取（Person 节点计数 + 总成本归一化）由 aggregate 层完成，compute 纯函数化
 *   正常: value = total_cost / head_count
 *   降级: head_count=0（分母 guard）
 *   边界: total_cost 显式 0 → value 0 且不降级
 */
import { describe, it, expect } from 'vitest';
import { computeCostPerHead } from '../../../extensions/sentinels/margin-health/computes/compute-cost-per-head';

describe('D358 compute-cost-per-head（迁自 _extinct/cost-health）', () => {
  it('正常: 总成本 1000 / 10 人 → 100', () => {
    const r = computeCostPerHead({ total_cost: 1000, head_count: 10 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBe(100);
    expect(r.evidence.some(e => e.includes('10'))).toBe(true);
  });

  it('降级: head_count=0 → degraded（分母 guard）', () => {
    const r = computeCostPerHead({ total_cost: 1000, head_count: 0 });
    expect(r.degraded).toBe(true);
    expect(r.value).toBe(0);
  });

  it('边界: total_cost 显式 0 → value 0，不降级', () => {
    const r = computeCostPerHead({ total_cost: 0, head_count: 5 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBe(0);
  });
});
