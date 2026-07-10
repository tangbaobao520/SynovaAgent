import { describe, it, expect } from 'vitest';
import { computeInformationFlow } from '../../../extensions/sentinels/shared/computes/l2-internal/compute-information-flow';

describe('COMPUTE-INFORMATION-FLOW-v1', () => {
  it('正常: 低过滤扁平组织', () => {
    const r = computeInformationFlow({ filteringLoss: 0.1, nLayers: 2 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeGreaterThan(0.9);
    expect(r.confidence).toBe('high');
  });

  it('降级: nLayers=0', () => {
    const r = computeInformationFlow({ filteringLoss: 0.3, nLayers: 0 });
    expect(r.degraded).toBe(true);
    expect(r.value).toBe(0);
  });

  it('边界: 高层级高过滤近乎失真', () => {
    const r = computeInformationFlow({ filteringLoss: 0.8, nLayers: 5 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeLessThan(0.7);
    expect(r.value).toBeGreaterThan(0.6);
  });
});
