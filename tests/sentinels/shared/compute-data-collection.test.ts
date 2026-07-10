import { describe, it, expect } from 'vitest';
import { computeDataCollection } from '../../../extensions/sentinels/shared/computes/l1-input/compute-data-collection';

describe('COMPUTE-DATA-COLLECTION-v1', () => {
  it('正常: 高频全覆盖高质量采集', () => {
    const r = computeDataCollection({ collectionCoverage: 0.9, dataQuality: 0.9, collectionFrequencyDays: 1 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeGreaterThan(0.5);
    expect(r.confidence).toBe('high');
  });

  it('降级: 无数据源', () => {
    const r = computeDataCollection({ collectionCoverage: -1, dataQuality: 0, collectionFrequencyDays: 0 });
    expect(r.degraded).toBe(true);
    expect(r.value).toBe(0);
  });

  it('边界: 月度低频采集', () => {
    const r = computeDataCollection({ collectionCoverage: 0.5, dataQuality: 0.5, collectionFrequencyDays: 30 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeLessThan(0.5);
  });
});
