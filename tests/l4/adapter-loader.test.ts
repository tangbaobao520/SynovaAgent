import { describe, it, expect } from 'vitest';
import { loadAdapters, clearAdapterCache } from '../../src/l4/adapter-loader';

describe('loadAdapters', () => {
  it('加载 >= 2 适配器', () => {
    const { adapters, degraded } = loadAdapters();
    expect(degraded).toBe(false);
    expect(adapters.length).toBeGreaterThanOrEqual(2);
  });
  it('包含 feishu', () => {
    const { adapters } = loadAdapters();
    expect(adapters.some(a => a.platform === 'feishu')).toBe(true);
  });
  it('第二次调用返回缓存', () => {
    const r1 = loadAdapters();
    const r2 = loadAdapters();
    expect(r1.adapters).toBe(r2.adapters);
  });
  it('清除缓存后重新加载', () => {
    clearAdapterCache();
    const { adapters } = loadAdapters();
    expect(adapters.length).toBeGreaterThanOrEqual(2);
  });
});
