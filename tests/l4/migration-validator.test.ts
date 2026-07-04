/**
 * tests/l4/migration-validator.test.ts — 迁移验证器单元测试
 *
 * 覆盖：diff 精度计算、状态分类（pass/review/block）、
 * 降级处理、批量验证、零值保护。
 */
import { describe, it, expect } from 'vitest';
import { validateMigration, validateAll } from '../../src/l4/migration-validator';

describe('validateMigration', () => {
  // === 精度分类 ===

  it('diff < 1% → status = pass', () => {
    const oldFn = () => ({ value: 100, degraded: false });
    const newFn = () => ({ value: 100.5, degraded: false });
    const report = validateMigration('test-fn', 'test-sentinel', oldFn, newFn);
    expect(report.status).toBe('pass');
    expect(report.diffPercent).toBeLessThan(0.01);
  });

  it('diff 1-5% → status = review', () => {
    const oldFn = () => ({ value: 100, degraded: false });
    const newFn = () => ({ value: 103, degraded: false });
    const report = validateMigration('test-fn', 'test-sentinel', oldFn, newFn);
    expect(report.status).toBe('review');
    expect(report.diffPercent).toBeGreaterThanOrEqual(0.01);
    expect(report.diffPercent).toBeLessThan(0.05);
  });

  it('diff > 5% → status = block', () => {
    const oldFn = () => ({ value: 100, degraded: false });
    const newFn = () => ({ value: 110, degraded: false });
    const report = validateMigration('test-fn', 'test-sentinel', oldFn, newFn);
    expect(report.status).toBe('block');
    expect(report.diffPercent).toBeGreaterThan(0.05);
  });

  // === 零值保护 ===

  it('handles zero old value without division by zero', () => {
    const oldFn = () => ({ value: 0, degraded: false });
    const newFn = () => ({ value: 0.5, degraded: false });
    const report = validateMigration('zero-fn', 's1', oldFn, newFn);
    // diffPercent = 0.5/1 = 0.5 = 50% → block (远大于5%)
    expect(report.diffPercent).toBe(0.5);
    expect(report.status).toBe('block');
  });

  it('handles both values at zero', () => {
    const oldFn = () => ({ value: 0, degraded: false });
    const newFn = () => ({ value: 0, degraded: false });
    const report = validateMigration('zero-zero', 's1', oldFn, newFn);
    expect(report.diffPercent).toBe(0);
    expect(report.status).toBe('pass');
  });

  // === 降级 ===

  it('marks degraded:true when new compute degenerates', () => {
    const oldFn = () => ({ value: 100, degraded: false });
    const newFn = () => ({ value: 0, degraded: true });
    const report = validateMigration('degraded-fn', 's1', oldFn, newFn);
    expect(report.degraded).toBe(true);
    // 降级不算 "block" — 算 review，因为可能是数据缺失而不是 bug
    expect(['review', 'block']).toContain(report.status);
  });

  // === 结构体 diff ===

  it('computes diff on structured results with multiple numeric fields', () => {
    const oldFn = () => ({ value: 200, details: { a: 10, b: 20 }, degraded: false });
    const newFn = () => ({ value: 205, details: { a: 11, b: 22 }, degraded: false });
    const report = validateMigration('struct-fn', 's1', oldFn, newFn);
    // diff = 5/200 = 2.5% → review
    expect(report.status).toBe('review');
    expect(report.diffPercent).toBeCloseTo(0.025, 4);
    expect(report.oldOutput).toBeDefined();
    expect(report.newOutput).toBeDefined();
  });
});

describe('validateAll', () => {
  it('validates multiple function pairs and returns reports array', () => {
    const oldComputes = [
      { functionName: 'fn-a', sentinelId: 's1', fn: () => ({ value: 100, degraded: false }) },
      { functionName: 'fn-b', sentinelId: 's1', fn: () => ({ value: 200, degraded: false }) },
    ];
    const newComputes = [
      { functionName: 'fn-a', sentinelId: 's1', fn: () => ({ value: 100.3, degraded: false }) },
      { functionName: 'fn-b', sentinelId: 's1', fn: () => ({ value: 210, degraded: false }) },
    ];
    const reports = validateAll(oldComputes, newComputes);
    expect(reports).toHaveLength(2);
    expect(reports[0].status).toBe('pass');
    expect(reports[1].status).toBe('review');
  });

  it('reports mismatch when function sets have different names', () => {
    const oldComputes = [
      { functionName: 'fn-a', sentinelId: 's1', fn: () => ({ value: 1, degraded: false }) },
    ];
    const newComputes = [
      { functionName: 'fn-b', sentinelId: 's1', fn: () => ({ value: 1, degraded: false }) },
    ];
    const reports = validateAll(oldComputes, newComputes);
    expect(reports.length).toBeGreaterThanOrEqual(1);
    const mismatch = reports.find(r => r.status === 'block');
    expect(mismatch).toBeDefined();
    expect(mismatch!.functionName).toMatch(/mismatch|fn-a|fn-b/i);
  });
});
