import { describe, it, expect } from 'vitest';
import { computeEfficiencyAttraction } from '../../../extensions/sentinels/shared/computes/l1-input/compute-efficiency-attraction';

describe('COMPUTE-EFFICIENCY-ATTRACTION-v1', () => {
  it('正常: 高利用率盈利运营', () => {
    const r = computeEfficiencyAttraction({ assetUtilizationRate: 0.9, operatingMargin: 0.3 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeGreaterThan(0.5);
    expect(r.confidence).toBe('high');
  });

  it('降级: 利用率为0', () => {
    const r = computeEfficiencyAttraction({ assetUtilizationRate: 0, operatingMargin: 0 });
    expect(r.degraded).toBe(true);
    expect(r.value).toBe(0);
  });

  it('边界: 利用率未配置', () => {
    const r = computeEfficiencyAttraction({ assetUtilizationRate: -1, operatingMargin: 0 });
    expect(r.degraded).toBe(true);
    expect(r.value).toBe(0);
  });
});
