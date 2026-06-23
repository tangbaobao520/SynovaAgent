/**
 * tests/l3/business-model-loader.test.ts — V3.8 Batch 4
 */
import { describe, it, expect } from 'vitest';
import { loadBusinessModels, clearBusinessModelCache } from '../../src/l3/business-model-loader';

describe('loadBusinessModels', () => {
  it('加载 >= 6 种商业模式', () => {
    const { models, degraded } = loadBusinessModels();
    expect(degraded).toBe(false);
    expect(models.length).toBeGreaterThanOrEqual(6);
  });
  it('包含 subscription', () => {
    const { models } = loadBusinessModels();
    expect(models.some(m => m.canvasType === 'subscription')).toBe(true);
  });
  it('第二次调用返回缓存', () => {
    const r1 = loadBusinessModels();
    const r2 = loadBusinessModels();
    expect(r1.models).toBe(r2.models);
  });
  it('清除缓存后重新加载', () => {
    clearBusinessModelCache();
    const { models } = loadBusinessModels();
    expect(models.length).toBeGreaterThanOrEqual(6);
  });
});
