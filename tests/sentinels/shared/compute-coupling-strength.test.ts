import { describe, it, expect } from 'vitest';
import { computeCouplingStrength } from '../../../extensions/sentinels/shared/computes/l2-value/compute-coupling-strength';

describe('computeCouplingStrength', () => {
  it('正常: 强正相关 → couplingStrength高', () => {
    const r = computeCouplingStrength({
      activityATimeSeries: [
        { marginalContribution: 10, period: '2026-Q1' },
        { marginalContribution: 12, period: '2026-Q2' },
        { marginalContribution: 14, period: '2026-Q3' },
        { marginalContribution: 16, period: '2026-Q4' },
      ],
      activityBTimeSeries: [
        { marginalContribution: 5, period: '2026-Q1' },
        { marginalContribution: 6, period: '2026-Q2' },
        { marginalContribution: 7, period: '2026-Q3' },
        { marginalContribution: 8, period: '2026-Q4' },
      ],
    });
    expect(r.degraded).toBe(false);
    expect(r.couplingStrength).toBeGreaterThan(0.8);
    expect(r.couplingDirection).not.toBe('none');
    expect(r.inertia).toBeGreaterThanOrEqual(0);
    expect(r.inertia).toBeLessThanOrEqual(1);
    expect(r.evidence.length).toBeGreaterThan(0);
  });

  it('降级: 数据不足(<3周期) → degraded', () => {
    const r = computeCouplingStrength({
      activityATimeSeries: [
        { marginalContribution: 10, period: '2026-Q1' },
        { marginalContribution: 12, period: '2026-Q2' },
      ],
      activityBTimeSeries: [
        { marginalContribution: 5, period: '2026-Q1' },
        { marginalContribution: 6, period: '2026-Q2' },
      ],
    });
    expect(r.degraded).toBe(true);
    expect(r.couplingStrength).toBe(0);
    expect(r.warnings.some(w => w.includes('数据不足'))).toBe(true);
  });

  it('降级: 时间序列全零 → degraded', () => {
    const r = computeCouplingStrength({
      activityATimeSeries: [
        { marginalContribution: 0, period: '2026-Q1' },
        { marginalContribution: 0, period: '2026-Q2' },
        { marginalContribution: 0, period: '2026-Q3' },
      ],
      activityBTimeSeries: [
        { marginalContribution: 1, period: '2026-Q1' },
        { marginalContribution: 2, period: '2026-Q2' },
        { marginalContribution: 3, period: '2026-Q3' },
      ],
    });
    expect(r.degraded).toBe(true);
    expect(r.warnings.some(w => w.includes('全零'))).toBe(true);
  });

  it('负相关: couplingStrength=|r| >0, direction识别', () => {
    const r = computeCouplingStrength({
      activityATimeSeries: [
        { marginalContribution: 10, period: '2026-Q1' },
        { marginalContribution: 8, period: '2026-Q2' },
        { marginalContribution: 6, period: '2026-Q3' },
        { marginalContribution: 4, period: '2026-Q4' },
        { marginalContribution: 2, period: '2027-Q1' },
      ],
      activityBTimeSeries: [
        { marginalContribution: 1, period: '2026-Q1' },
        { marginalContribution: 3, period: '2026-Q2' },
        { marginalContribution: 5, period: '2026-Q3' },
        { marginalContribution: 7, period: '2026-Q4' },
        { marginalContribution: 9, period: '2027-Q1' },
      ],
    });
    expect(r.degraded).toBe(false);
    expect(r.couplingStrength).toBeGreaterThan(0.5);
    expect(r.couplingDirection).not.toBe('none');
  });

  it('长时间序列: 高置信度', () => {
    const ts = Array.from({ length: 24 }, (_, i) => ({
      marginalContribution: 10 + i * 0.5 + Math.random() * 2,
      period: `M${i + 1}`,
    }));
    const ts2 = Array.from({ length: 24 }, (_, i) => ({
      marginalContribution: 5 + i * 0.25 + Math.random() * 1,
      period: `M${i + 1}`,
    }));
    const r = computeCouplingStrength({
      activityATimeSeries: ts,
      activityBTimeSeries: ts2,
    });
    expect(r.degraded).toBe(false);
    expect(r.confidence).toBe('high');
    expect(r.couplingStrength).toBeGreaterThanOrEqual(0);
  });
});
