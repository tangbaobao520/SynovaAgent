import { describe, it, expect, beforeEach } from 'vitest';
import { AdapterRegistry } from '../../src/agent/adapter-registry';

describe('adapters route (registry integration)', () => {
  let registry: AdapterRegistry;

  beforeEach(() => {
    registry = AdapterRegistry.getInstance();
    registry.clear();
  });

  it('空注册表 — 空列表', () => {
    const s = registry.state();
    expect(s.count).toBe(0);
    expect(s.adapters).toEqual([]);
  });

  it('注册后返回适配器', () => {
    registry.register({ name: 'erp-standard', label: '标准ERP', targetNodeType: 'Financial', registeredAt: '', config: null });
    const s = registry.state();
    expect(s.count).toBe(1);
    expect(s.adapters[0].name).toBe('erp-standard');
  });

  it('reload 语义: clear → 注册', () => {
    registry.register({ name: 'old', label: 'Old', targetNodeType: 'Financial', registeredAt: '', config: null });
    registry.clear();
    expect(registry.list()).toHaveLength(0);
    registry.register({ name: 'new', label: 'New', targetNodeType: 'Financial', registeredAt: '', config: null });
    expect(registry.list()).toHaveLength(1);
    expect(registry.get('new')).toBeDefined();
  });

  it('多个适配器排序', () => {
    for (const name of ['z', 'a', 'm']) {
      registry.register({ name, label: name, targetNodeType: 'Financial', registeredAt: '', config: null });
    }
    expect(registry.list().map(a => a.name)).toEqual(['a', 'm', 'z']);
  });
});
