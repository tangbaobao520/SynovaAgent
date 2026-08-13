/**
 * tests/l4/migration-validator.test.ts
 */
import { describe, it, expect } from 'vitest';
import { validateMigration } from '../../src/l4/migration-validator';

describe('validateMigration', () => {
  it('diff < 1% → pass', () => {
    const r = validateMigration('kz-index', 'F1', { value: 1.5 }, { value: 1.51 });
    expect(r.status).toBe('pass');
    expect(r.diffPercent).toBeLessThan(0.01);
  });

  it('diff 1-5% → review', () => {
    const r = validateMigration('kz-index', 'F1', { value: 1.0 }, { value: 1.03 });
    expect(r.status).toBe('review');
    expect(r.diffPercent).toBeGreaterThanOrEqual(0.01);
    expect(r.diffPercent).toBeLessThan(0.05);
  });

  it('diff > 5% → block', () => {
    const r = validateMigration('kz-index', 'F1', { value: 1.0 }, { value: 1.2 });
    expect(r.status).toBe('block');
    expect(r.diffPercent).toBeGreaterThanOrEqual(0.05);
  });

  it('handles nested object comparison', () => {
    const oldOutput = { value: 100, details: { mean: 50, slope: 2 } };
    const newOutput = { value: 100.5, details: { mean: 50.3, slope: 2.01 } };
    const r = validateMigration('test-fn', 'T1', oldOutput, newOutput);
    expect(r.status).toBe('pass');
    expect(r.diffPercent).toBeLessThan(0.01);
  });

  it('warns when non-numeric fields differ', () => {
    const r = validateMigration('test', 'T1', { value: 10, name: 'old' }, { value: 10, name: 'new' });
    expect(r.warnings.some(w => w.includes('name'))).toBe(true);
  });

  it('warns on empty outputs', () => {
    const r = validateMigration('empty', 'E1', {}, {});
    expect(r.warnings.some(w => w.includes('empty'))).toBe(true);
  });

  it('uses first numeric field when value is absent', () => {
    const r = validateMigration('test', 'T1', { score: 100 }, { score: 102 });
    expect(r.status).toBeDefined();
    expect(r.diffPercent).toBeGreaterThan(0);
  });
});
