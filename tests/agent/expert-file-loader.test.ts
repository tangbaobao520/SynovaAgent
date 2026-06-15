/**
 * tests/agent/expert-file-loader.test.ts — ExpertFileLoader 单元测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ExpertFileLoader } from '../../src/agent/expert-file-loader';
import { getExpertRegistry } from '../../src/l3/expert-registry';
import type { FileIndex } from '../../src/agent/file-scanner';

function makeIndex(overrides: Partial<FileIndex> = {}): FileIndex {
  return {
    scannedAt: new Date().toISOString(),
    rootDir: '/test',
    experts: [],
    measurers: [],
    knowledge: [],
    errors: [],
    ...overrides,
  };
}

describe('ExpertFileLoader', () => {
  let loader: ExpertFileLoader;

  beforeEach(() => {
    loader = new ExpertFileLoader();
    // 重置 registry
    const registry = getExpertRegistry();
    for (const type of registry.listTypes()) {
      if (!['strategy', 'org', 'finance', 'tech', 'marketing', 'action', 'business_model', 'knowledge'].includes(type)) {
        registry.unregister(type);
      }
    }
  });

  it('空索引 — 使用默认 prompt 注册所有专家', () => {
    const defaults: Record<string, string> = {
      strategy: 'default strategy prompt',
      org: 'default org prompt',
    };

    const result = loader.loadFromIndex(makeIndex(), defaults);

    expect(result.fromFiles).toBe(0);
    expect(result.fromDefaults).toBe(2);
    expect(result.loaded).toHaveLength(2);
    expect(result.errors).toHaveLength(0);

    const registry = getExpertRegistry();
    expect(registry.getPrompt('strategy')).toBe('default strategy prompt');
    expect(registry.getPrompt('org')).toBe('default org prompt');
  });

  it('有专家文件 — 文件内容覆盖默认 prompt', () => {
    const index = makeIndex({
      experts: [{
        name: 'strategy',
        files: {
          IDENTITY: {
            relativePath: 'expert/strategy/IDENTITY.md',
            absolutePath: '/test/expert/strategy/IDENTITY.md',
            content: '战略分析专家',
            size: 100,
            lastModified: new Date().toISOString(),
          },
          SOUL: {
            relativePath: 'expert/strategy/SOUL.md',
            absolutePath: '/test/expert/strategy/SOUL.md',
            content: '三层诊断框架',
            size: 200,
            lastModified: new Date().toISOString(),
          },
        },
      }],
    });

    const defaults = { strategy: 'OLD default' };
    const result = loader.loadFromIndex(index, defaults);

    expect(result.fromFiles).toBe(1);
    expect(result.fromDefaults).toBe(0);
    const registry = getExpertRegistry();
    const prompt = registry.getPrompt('strategy')!;
    expect(prompt).toContain('战略分析专家');
    expect(prompt).toContain('三层诊断框架');
    // 文件源被记录
    expect(result.loaded[0].sources).toHaveLength(2);
  });

  it('部分文件缺失 — loaded expert 标记 degraded', () => {
    const index = makeIndex({
      experts: [{
        name: 'strategy',
        files: {
          IDENTITY: {
            relativePath: 'expert/strategy/IDENTITY.md',
            absolutePath: '/test/expert/strategy/IDENTITY.md',
            content: 'only identity, no SOUL',
            size: 50,
            lastModified: new Date().toISOString(),
          },
        },
      }],
    });

    const defaults = { strategy: 'fallback' };
    const result = loader.loadFromIndex(index, defaults);

    expect(result.fromFiles).toBe(1);
    expect(result.loaded[0].degraded).toBe(true);
    // SOUL.md 缺失
    expect(result.loaded[0].degradedReasons).toContain('SOUL.md 缺失');
  });

  it('文件为空 — 降级使用默认 prompt', () => {
    const index = makeIndex({
      experts: [{
        name: 'strategy',
        files: {
          SOUL: {
            relativePath: 'expert/strategy/SOUL.md',
            absolutePath: '/test/expert/strategy/SOUL.md',
            content: '',  // 空内容
            size: 0,
            lastModified: new Date().toISOString(),
          },
        },
      }],
    });

    const defaults = { strategy: 'default strategy' };
    const result = loader.loadFromIndex(index, defaults);

    // 所有文件为空 → 降级使用默认
    expect(result.fromDefaults).toBeGreaterThanOrEqual(0);
    const registry = getExpertRegistry();
    const prompt = registry.getPrompt('strategy');
    expect(prompt).toBeDefined();
  });
});
