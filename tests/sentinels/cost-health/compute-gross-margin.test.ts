/**
 * compute-gross-margin.test.ts — computeGrossMargin 契约测试
 * D584 对齐: cost-health/profit-health 已 D358 去灭绝并入 margin-health（自家 computes/ 计算），import 对齐 live 契约。
 * live 契约: input {total_revenue, gross_margin}[]; value = grossProfit/totalRevenue; 零营收 → degraded。
 */
import { describe, it, expect } from 'vitest';
import { computeGrossMargin } from '../../../extensions/sentinels/margin-health/computes/compute-gross-margin';

describe('computeGrossMargin', () => {
  it('should compute positive gross margin', () => {
    const r = computeGrossMargin([{ total_revenue: 100000, gross_margin: 40000 }]);
    expect(r.degraded).toBe(false);
    expect(r.value).toBe(0.4); // 40k/100k
  });

  it('should degrade on empty data', () => {
    const r = computeGrossMargin([]);
    expect(r.degraded).toBe(true);
    expect(r.warnings.some(w => w.includes('无财务数据'))).toBe(true);
  });

  it('should degrade on zero revenue (分母 guard)', () => {
    const r = computeGrossMargin([{ total_revenue: 0, gross_margin: 0 }]);
    expect(r.degraded).toBe(true);
    expect(r.warnings.some(w => w.includes('总收入为 0'))).toBe(true);
  });
});
