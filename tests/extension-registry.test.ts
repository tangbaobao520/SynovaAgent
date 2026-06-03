/**
 * extension-registry.test.ts — Slice A2: ExtensionRegistry 测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ExtensionRegistry, getExtensionRegistry } from '../src/extensions/registry';
import type { ExtensionManifest } from '../src/extensions/types';

function fakeManifest(name: string, type: 'sog-node' | 'tool' | 'expert-agent' = 'tool'): ExtensionManifest {
  return {
    name,
    version: '1.0.0',
    type,
    description: `Fake ${name}`,
  };
}

describe('ExtensionRegistry — lifecycle', () => {
  let registry: ExtensionRegistry;

  beforeEach(() => { registry = new ExtensionRegistry(); });

  it('Given new registry, When list, Then returns empty', () => {
    expect(registry.list()).toHaveLength(0);
  });

  it('Given registered extension, When resolve, Then returns it with active state', () => {
    const m = fakeManifest('test-ext');
    const impl = { doSomething: () => 'ok' };
    const resolved = registry.register(m, impl);
    expect(resolved.state).toBe('active');
    expect(resolved.manifest.name).toBe('test-ext');
  });

  it('Given registered extension, When list by type, Then filters correctly', () => {
    registry.register(fakeManifest('a', 'tool'), {});
    registry.register(fakeManifest('b', 'sog-node'), {});
    expect(registry.list('tool')).toHaveLength(1);
    expect(registry.list('sog-node')).toHaveLength(1);
  });

  it('Given extension with missing dependency, When register, Then state is error', () => {
    const m: ExtensionManifest = { ...fakeManifest('broken'), dependencies: ['does-not-exist'] };
    const resolved = registry.register(m, {});
    expect(resolved.state).toBe('error');
  });

  it('Given unregistered, When unregister, Then removed', () => {
    registry.register(fakeManifest('test'), {});
    registry.unregister('test');
    expect(registry.list()).toHaveLength(0);
  });

  it('Given active extensions, When stats, Then returns counts', () => {
    registry.register(fakeManifest('t1', 'tool'), {});
    registry.register(fakeManifest('t2', 'tool'), {});
    registry.register(fakeManifest('s1', 'sog-node'), {});
    const stats = registry.stats();
    expect(stats['tool:active']).toBe(2);
    expect(stats['sog-node:active']).toBe(1);
  });
});

describe('getExtensionRegistry — singleton', () => {
  it('Given two calls, When getExtensionRegistry, Then same instance', () => {
    const r1 = getExtensionRegistry();
    const r2 = getExtensionRegistry();
    expect(r1).toBe(r2);
  });
});
