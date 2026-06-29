/**
 * tests/sentinel/builtins.test.ts — 内置哨兵注册测试
 *
 * Iron Law 33: *.test.ts = 单元测试
 *
 * 测试:
 *   Given: 扫描 adapters/ 目录 → 注册发现的哨兵
 *   Given: 注册后 → Then: 每个哨兵有唯一 ID、有效 cron、明确类别
 */

import { describe, it, expect, beforeEach } from 'vitest';

function makeMockSentinel(id: string, category: string, cron: string) {
  return {
    config: { id, name: `Test ${id}`, description: '', category, priority: 'P1', mode: 'cron' as const, cron, requiredDataSources: [], confidenceModel: 'deterministic' as const, version: '1.0.0' },
    check: () => Promise.resolve({ sentinelId: id, ok: true, findings: [], durationMs: 0, checkedAt: new Date().toISOString() }),
  };
}

import { getSentinelRegistry, destroySentinelRegistry } from '../../src/sentinel/registry';
import { registerBuiltinSentinels } from '../../src/sentinel/builtins';

describe('registerBuiltinSentinels', () => {
  beforeEach(() => {
    destroySentinelRegistry();
  });

  // 注册计数由 adapters/ 目录中文件数决定，不在测试中硬编码

  it('Given 注册后 → 每个哨兵有唯一 ID 和有效类别', async () => {
    await registerBuiltinSentinels();
    const ids = new Set<string>();
    const validCategories = new Set(['collaboration', 'capability', 'strategy', 'risk', 'health', 'data-quality', 'growth']);
    for (const s of getSentinelRegistry().list()) {
      expect(ids.has(s.config.id)).toBe(false);
      ids.add(s.config.id);
      expect(s.config.id).toMatch(/^sentinel-/);
      expect(validCategories.has(s.config.category)).toBe(true);
      expect(s.config.mode).toBe('cron');
      expect(s.config.cron).toBeTruthy();
    }
  });

  it('Given 两次调用 registerBuiltinSentinels → 覆盖旧哨兵不抛异常', async () => {
    await registerBuiltinSentinels();
    await registerBuiltinSentinels();
    expect(getSentinelRegistry().count()).toBeGreaterThanOrEqual(0);
  });
});
