import { describe, it, expect, beforeEach } from 'vitest';
import { AdapterRegistry, type AdapterEntry } from '../../src/agent/adapter-registry';

describe('AdapterRegistry', () => {
  let registry: AdapterRegistry;

  beforeEach(() => {
    registry = AdapterRegistry.getInstance();
    registry.clear();
  });

  const entry = (name: string): AdapterEntry => ({
    name, label: name, targetNodeType: 'Financial', registeredAt: new Date().toISOString(), config: null,
  });

  it('register + list', () => {
    registry.register(entry('test'));
    expect(registry.list()).toHaveLength(1);
    expect(registry.list()[0].name).toBe('test');
  });

  it('get — 存在返回 entry', () => {
    registry.register(entry('test'));
    expect(registry.get('test')).toBeDefined();
  });

  it('get — 不存在返回 undefined', () => {
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('unregister — 成功返回 true', () => {
    registry.register(entry('t'));
    expect(registry.unregister('t')).toBe(true);
    expect(registry.list()).toHaveLength(0);
  });

  it('unregister — 不存在返回 false', () => {
    expect(registry.unregister('x')).toBe(false);
  });

  it('clear — 清空', () => {
    registry.register(entry('a'));
    registry.register(entry('b'));
    registry.clear();
    expect(registry.list()).toHaveLength(0);
  });

  it('list — 按名称排序', () => {
    registry.register(entry('z'));
    registry.register(entry('a'));
    registry.register(entry('m'));
    expect(registry.list().map(e => e.name)).toEqual(['a', 'm', 'z']);
  });

  it('state — 返回快照', () => {
    registry.register(entry('x'));
    const s = registry.state();
    expect(s.count).toBe(1);
    expect(s.degraded).toBe(false);
  });

  it('registerFromScan — 批量注册', () => {
    const result = registry.registerFromScan([
      { name: 'a', label: 'A', targetNodeType: 'Financial' },
      { name: 'b', label: 'B', targetNodeType: 'Financial' },
    ]);
    expect(result.registered).toBe(2);
  });
});
