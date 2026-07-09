import { describe, it, expect } from 'vitest';
import { computeOccupancy } from '../../../extensions/sentinels/shared/computes/l2-value/compute-occupancy';

describe('computeOccupancy', () => {
  it('正常: 中等占位优势', () => {
    const r = computeOccupancy({
      populationDensity: 0.5,
      windowDurationMonths: 12,
      timeToOccupyMonths: 6,
      occupancyDurationMonths: 8,
    });
    expect(r.degraded).toBe(false);
    expect(r.occupancyAdvantage).toBeGreaterThan(0);
    expect(r.occupancyAdvantage).toBeLessThanOrEqual(1);
    expect(r.windowClosing).toBe(false);
    expect(r.evidence.length).toBeGreaterThan(0);
  });

  it('降级: GA未配置populationDensity → degraded', () => {
    const r = computeOccupancy({
      populationDensity: -1, // 未配置
      windowDurationMonths: 12,
      timeToOccupyMonths: 6,
      occupancyDurationMonths: 8,
    });
    expect(r.degraded).toBe(true);
    expect(r.occupancyAdvantage).toBe(0);
    expect(r.warnings.some(w => w.includes('需GA配置'))).toBe(true);
    expect(r.confidence).toBe('low');
  });

  it('降级: 时间参数无效 → degraded', () => {
    const r = computeOccupancy({
      populationDensity: 0.5,
      windowDurationMonths: 0, // 无效
      timeToOccupyMonths: 6,
      occupancyDurationMonths: 8,
    });
    expect(r.degraded).toBe(true);
    expect(r.warnings.some(w => w.includes('时间参数无效'))).toBe(true);
  });

  it('窗口关闭检测: window_duration<6且已超时', () => {
    const r = computeOccupancy({
      populationDensity: 0.7,
      windowDurationMonths: 4,
      timeToOccupyMonths: 3,
      occupancyDurationMonths: 5,
    });
    expect(r.degraded).toBe(false);
    expect(r.windowClosing).toBe(true);
    expect(r.warnings.some(w => w.includes('窗口即将关闭'))).toBe(true);
  });

  it('高密度+长窗口: 占位优势高', () => {
    const r = computeOccupancy({
      populationDensity: 0.9,
      windowDurationMonths: 24,
      timeToOccupyMonths: 3,
      legitimacyThreshold: 0.8,
      occupancyDurationMonths: 6,
    });
    expect(r.degraded).toBe(false);
    expect(r.occupancyAdvantage).toBeGreaterThan(0.5);
    expect(r.windowClosing).toBe(false);
  });

  it('低密度+短窗口: 占位优势接近0', () => {
    const r = computeOccupancy({
      populationDensity: 0.1,
      windowDurationMonths: 2,
      timeToOccupyMonths: 12,
      occupancyDurationMonths: 1,
    });
    expect(r.degraded).toBe(false);
    expect(r.occupancyAdvantage).toBeLessThan(0.1);
  });
});
