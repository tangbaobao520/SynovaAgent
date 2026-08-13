/**
 * sentinel-accuracy.test.ts — 哨兵精度基线 6 场景测试
 *
 * T9 Part A3: 正常/标注不足/完美哨兵/四态混合/correction-only/空标注
 */

import { describe, it, expect } from 'vitest';
import { computeSentinelAccuracy, type AnnotationRecord } from '../../src/sentinel/sentinel-accuracy';

function ann(type: AnnotationRecord['annotation']): AnnotationRecord {
  return { annotation: type };
}

describe('computeSentinelAccuracy', () => {
  it('正常路径：50 条标注返回正确 precision/recall/f1', () => {
    const annotations = [
      ...Array.from({ length: 30 }, () => ann('confirmed')),
      ...Array.from({ length: 10 }, () => ann('false_alarm')),
      ...Array.from({ length: 5 }, () => ann('uncertain')),
      ...Array.from({ length: 5 }, () => ann('correction')),
    ];
    const r = computeSentinelAccuracy('test-sentinel', annotations);
    expect(r.totalAnnotations).toBe(50);
    expect(r.degraded).toBe(false);
    expect(r.precision).toBe(0.75);
    expect(r.recall).toBe(0.86);
    expect(r.f1).toBe(0.80);
    expect(r.uncertainRate).toBe(0.10);
  });

  it('标注不足：5 条标注返回 degraded:true', () => {
    const annotations = [
      ...Array.from({ length: 3 }, () => ann('confirmed')),
      ...Array.from({ length: 2 }, () => ann('false_alarm')),
    ];
    const r = computeSentinelAccuracy('degraded-sentinel', annotations);
    expect(r.totalAnnotations).toBe(5);
    expect(r.degraded).toBe(true);
    expect(r.precision).toBe(0);
    expect(r.warnings[0]).toContain('至少需要10条');
  });

  it('完美哨兵：全部 confirmed → precision=1.0, recall=1.0', () => {
    const annotations = Array.from({ length: 20 }, () => ann('confirmed'));
    const r = computeSentinelAccuracy('perfect-sentinel', annotations);
    expect(r.degraded).toBe(false);
    expect(r.precision).toBe(1.0);
    expect(r.recall).toBe(1.0);
    expect(r.f1).toBe(1.0);
    expect(r.warnings).toHaveLength(0);
  });

  it('四态混合：confirmed=20, false_alarm=5, uncertain=3, correction=2', () => {
    const annotations = [
      ...Array.from({ length: 20 }, () => ann('confirmed')),
      ...Array.from({ length: 5 }, () => ann('false_alarm')),
      ...Array.from({ length: 3 }, () => ann('uncertain')),
      ...Array.from({ length: 2 }, () => ann('correction')),
    ];
    const r = computeSentinelAccuracy('mixed-sentinel', annotations);
    expect(r.totalAnnotations).toBe(30);
    expect(r.precision).toBe(0.80);
    expect(r.recall).toBe(0.91);
    expect(r.f1).toBe(0.85);
    expect(r.uncertainRate).toBe(0.10);
  });

  it('correction-only：全部 correction → recall=0', () => {
    const annotations = Array.from({ length: 15 }, () => ann('correction'));
    const r = computeSentinelAccuracy('all-correction', annotations);
    expect(r.precision).toBe(1.0);
    expect(r.recall).toBe(0);
    expect(r.f1).toBe(0);
    expect(r.warnings.some(w => w.includes('修正标注数不低于确认数'))).toBe(true);
  });

  it('空标注：0 条 → degraded', () => {
    const r = computeSentinelAccuracy('empty-sentinel', []);
    expect(r.totalAnnotations).toBe(0);
    expect(r.degraded).toBe(true);
    expect(r.precision).toBe(0);
  });
});
