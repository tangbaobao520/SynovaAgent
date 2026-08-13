/**
 * tests/compute/compute-working-capital.test.ts — D61 营运资本测试
 */
import { describe, it, expect } from 'vitest';

describe('computeWorkingCapital', () => {
  it('正常路径: 现金转换周期计算正确', async () => {
    const { computeWorkingCapital } = await import('../../extensions/sentinels/shared/computes/l1-input/compute-working-capital');
    const result = computeWorkingCapital(500, 300, 100, 200, 150, 1200, 800);
    expect(result.degraded).toBe(false);
    expect(result.cashConversionCycle).toBeGreaterThan(0);
    expect(result.liquidityRiskTier).toBeTruthy();
    expect(result.workingCapitalRatio).toBeGreaterThan(1);
    expect(result.economicInterpretation.efficiency).toBeTruthy();
  });

  it('降级: 收入为0 → degraded', async () => {
    const { computeWorkingCapital } = await import('../../extensions/sentinels/shared/computes/l1-input/compute-working-capital');
    const result = computeWorkingCapital(500, 300, 100, 200, 150, 0, 800);
    expect(result.degraded).toBe(true);
    expect(result.liquidityRiskTier).toBe('critical');
  });

  it('边界: 流动负债为0 → workingCapitalRatio=Infinity', async () => {
    const { computeWorkingCapital } = await import('../../extensions/sentinels/shared/computes/l1-input/compute-working-capital');
    const result = computeWorkingCapital(500, 0, 100, 200, 150, 1200, 800);
    expect(result.degraded).toBe(false);
    expect(result.workingCapitalRatio).toBe(Infinity);
    expect(result.liquidityRiskTier).toBe('low');
  });
});
