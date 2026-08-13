/**
 * tests/computes/compute-assumption-linkage.test.ts
 *
 * E-42 ASSUMPTION_LINKAGE — 假设有效性与重配触发
 * 覆盖: 正常/降级/边界
 */
import { describe, it, expect } from 'vitest';
import { computeAssumptionLinkage } from '../../extensions/sentinels/shared/computes/l5-reinput/compute-assumption-linkage';

describe('computeAssumptionLinkage', () => {
  it('正常参数 → 返回假设关联评分', () => {
    const result = computeAssumptionLinkage({ assumptionValidity: 0.8, reallocationTrigger: 0.9 });
    expect(result.degraded).toBe(false);
    expect(result.value).toBeGreaterThan(0.5);
    expect(result.confidence).toBe('high');
  });

  it('任意参数缺失 → 降级', () => {
    const result = computeAssumptionLinkage({ assumptionValidity: -1, reallocationTrigger: 0.5 });
    expect(result.degraded).toBe(true);
    expect(result.value).toBe(0);
  });

  it('边界值 → 不崩溃', () => {
    const result = computeAssumptionLinkage({ assumptionValidity: 1.5, reallocationTrigger: 0.5 });
    expect(result.degraded).toBe(false);
    expect(result.value).toBeGreaterThanOrEqual(0);
  });
});
