/**
 * compute-cost-per-head.test.ts — computeCostPerHead 契约测试
 * D584 对齐: cost-health/profit-health 已 D358 去灭绝并入 margin-health（自家 computes/ 计算），import 对齐 live 契约。
 * live 契约: 纯函数 input {total_cost, head_count}（不再是 store reader）; head_count 0 → degraded。
 */
import { describe, it, expect } from 'vitest';
import { computeCostPerHead } from '../../../extensions/sentinels/margin-health/computes/compute-cost-per-head';

describe('computeCostPerHead', () => {
  it('should compute cost per head', () => {
    const r = computeCostPerHead({ total_cost: 500000, head_count: 5 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBe(100000); // 500000/5
  });

  it('should degrade on zero headcount (分母 guard)', () => {
    const r = computeCostPerHead({ total_cost: 100000, head_count: 0 });
    expect(r.degraded).toBe(true);
    expect(r.value).toBe(0);
  });
});
