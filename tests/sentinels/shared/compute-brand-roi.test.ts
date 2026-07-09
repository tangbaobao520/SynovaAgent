import { describe, it, expect } from 'vitest';
import { computeBrandROI } from '../../../extensions/sentinels/shared/computes/l2-value/compute-brand-roi';

describe('computeBrandROI', () => {
  it('≥18 months: normal ROI + brandHealthScore', () => {
    const r = computeBrandROI({
      brandInvestment: 1000,
      awarenessLift: 0.1,
      premiumRatioChange: 0.05,
      repeatPurchaseLift: 0.08,
      npsChange: 0.03,
      lagMonths: 12,
      dataMonths: 18,
    });
    expect(r.degraded).toBe(false);
    expect(r.confidence).toBe('high');
    expect(r.roi).toBeGreaterThanOrEqual(-1);
    expect(r.brandHealthScore).toBeGreaterThan(0);
    expect(r.brandHealthScore).toBeLessThanOrEqual(100);
    expect(r.warnings).toHaveLength(0);
  });

  it('6-17 months: degraded=true, confidence=medium, warnings non-empty', () => {
    const r = computeBrandROI({
      brandInvestment: 1000,
      awarenessLift: 0.1,
      premiumRatioChange: 0.05,
      repeatPurchaseLift: 0.08,
      npsChange: 0.03,
      lagMonths: 6,
      dataMonths: 12,
    });
    expect(r.degraded).toBe(true);
    expect(r.confidence).toBe('medium');
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.warnings[0]).toContain('12');
  });

  it('<6 months: degraded=true, warning contains "数据不足"', () => {
    const r = computeBrandROI({
      brandInvestment: 1000,
      awarenessLift: 0,
      premiumRatioChange: 0,
      repeatPurchaseLift: 0,
      npsChange: 0,
      lagMonths: 3,
      dataMonths: 3,
    });
    expect(r.degraded).toBe(true);
    expect(r.confidence).toBe('low');
    expect(r.warnings.some(w => w.includes('数据不足'))).toBe(true);
    expect(r.roi).toBe(0);
    expect(r.brandHealthScore).toBe(0);
  });

  it('brandInvestment=0: degraded=true, warning contains "无品牌投入"', () => {
    const r = computeBrandROI({
      brandInvestment: 0,
      awarenessLift: 0.1,
      premiumRatioChange: 0.05,
      repeatPurchaseLift: 0.08,
      npsChange: 0.03,
      lagMonths: 12,
      dataMonths: 24,
    });
    expect(r.degraded).toBe(true);
    expect(r.confidence).toBe('low');
    expect(r.warnings.some(w => w.includes('无品牌投入'))).toBe(true);
    expect(r.roi).toBe(0);
    expect(r.brandHealthScore).toBe(0);
  });

  it('all positive: roi>0, brandHealthScore>0', () => {
    const r = computeBrandROI({
      brandInvestment: 1000,
      awarenessLift: 0.2,
      premiumRatioChange: 0.15,
      repeatPurchaseLift: 0.18,
      npsChange: 0.1,
      lagMonths: 9,
      dataMonths: 24,
    });
    expect(r.degraded).toBe(false);
    expect(r.roi).toBeGreaterThan(0);
    expect(r.brandHealthScore).toBeGreaterThan(0);
    expect(r.confidence).toBe('high');
  });

  it('all negative: brandHealthScore may still be >0 but roi negative', () => {
    const r = computeBrandROI({
      brandInvestment: 1000,
      awarenessLift: -0.3,
      premiumRatioChange: -0.2,
      repeatPurchaseLift: -0.25,
      npsChange: -0.1,
      lagMonths: 12,
      dataMonths: 24,
    });
    // f = (-0.3*0.25) + (-0.2*0.30) + (-0.25*0.25) + (-0.1*0.20) = -0.075 -0.06 -0.0625 -0.02 = -0.2175
    // brandHealthScore = max(0, -0.2175 * 100) = 0
    // roi = (1000*(1-0.2175) - 1000) / 1000 = -0.2175
    expect(r.degraded).toBe(false);
    expect(r.roi).toBeLessThan(0);
    expect(r.brandHealthScore).toBe(0);
    expect(r.roi).toBeCloseTo(-0.2175, 4);
  });
});
