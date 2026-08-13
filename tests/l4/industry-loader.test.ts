/**
 * tests/l4/industry-loader.test.ts — V3.8 Batch 4
 */
import { describe, it, expect } from 'vitest';
import { loadIndustries, getIndustry, listIndustries } from '../../src/l4/industry-loader';

describe('loadIndustries', () => {
  it('加载 >= 4 行业模板', () => {
    const { industries, degraded } = loadIndustries();
    expect(degraded).toBe(false);
    expect(industries.length).toBeGreaterThanOrEqual(4);
  });
  it('saas-tech extends general-enterprise', () => {
    const saas = getIndustry('saas-tech');
    expect(saas).not.toBeNull();
    expect(saas!.extends).toBe('general-enterprise');
  });
  it('list 包含所有行业名', () => {
    const list = listIndustries();
    expect(list).toContain('saas-tech');
    expect(list).toContain('manufacturing');
  });
});
