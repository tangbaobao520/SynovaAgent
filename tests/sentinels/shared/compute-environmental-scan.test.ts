import { describe, it, expect } from 'vitest';
import { computeEnvironmentalScan } from '../../../extensions/sentinels/shared/computes/l1-input/compute-environmental-scan';

describe('COMPUTE-ENVIRONMENTAL-SCAN-v1', () => {
  it('正常: 全面扫描高有效性', () => {
    const r = computeEnvironmentalScan({ scanBreadth: 0.9, scanDepth: 0.8, filterBias: 0.2 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeGreaterThan(0.5);
    expect(r.confidence).toBe('high');
  });

  it('降级: 无外部数据源', () => {
    const r = computeEnvironmentalScan({ scanBreadth: -1, scanDepth: 0.5, filterBias: 0.3 });
    expect(r.degraded).toBe(true);
    expect(r.value).toBe(0);
    expect(r.warnings.some(w => w.includes('未配置'))).toBe(true);
  });

  it('边界: filterBias=1 完全过滤', () => {
    const r = computeEnvironmentalScan({ scanBreadth: 0.8, scanDepth: 0.8, filterBias: 1 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBe(0);
  });
});
