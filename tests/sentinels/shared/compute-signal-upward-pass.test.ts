import { describe, it, expect } from 'vitest';
import { computeSignalUpwardPass } from '../../../extensions/sentinels/shared/computes/l1-input/compute-signal-upward-pass';

describe('COMPUTE-SIGNAL-UPWARD-PASS-v1', () => {
  it('正常: 扁平组织高保真度', () => {
    const r = computeSignalUpwardPass({ upwardFilterLoss: 0.2, nLayers: 2 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeGreaterThan(0.5);
    expect(r.value).toBeLessThanOrEqual(1);
  });

  it('降级: nLayers=0', () => {
    const r = computeSignalUpwardPass({ upwardFilterLoss: 0.3, nLayers: 0 });
    expect(r.degraded).toBe(true);
    expect(r.value).toBe(0);
  });

  it('边界: 高层级信息几乎失真', () => {
    const r = computeSignalUpwardPass({ upwardFilterLoss: 0.5, nLayers: 10 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeGreaterThan(0.9);
    expect(r.confidence).toBe('medium');
  });
});
