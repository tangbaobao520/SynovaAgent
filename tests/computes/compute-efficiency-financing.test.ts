/**
 * tests/computes/compute-efficiency-financing.test.ts
 *
 * E-12 EFFICIENCY_FINANCING — 效率信号与融资效率
 * 覆盖: 正常/降级/边界
 */
import { describe, it, expect } from 'vitest';
import { computeEfficiencyFinancing } from '../../extensions/sentinels/shared/computes/l1-input/compute-efficiency-financing';

describe('computeEfficiencyFinancing', () => {
  it('正常参数 → 返回计算结果', () => {
    const result = computeEfficiencyFinancing({ efficiencySignal: 0.8, financingEfficiency: 0.7, investmentSignal: 0.6 });
    expect(result.degraded).toBe(false);
    expect(result.value).toBeGreaterThan(0);
    expect(result.confidence).toBe('high');
  });

  it('效率信号与融资效率均缺失 → 降级', () => {
    const result = computeEfficiencyFinancing({ efficiencySignal: -1, financingEfficiency: -1, investmentSignal: 0.5 });
    expect(result.degraded).toBe(true);
    expect(result.value).toBe(0);
  });

  it('边界值 → 不崩溃', () => {
    const result = computeEfficiencyFinancing({ efficiencySignal: 2, financingEfficiency: -0.5, investmentSignal: 0 });
    expect(result.degraded).toBe(false);
    expect(result.value).toBeGreaterThanOrEqual(0);
  });
});
