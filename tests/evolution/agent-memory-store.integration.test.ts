/**
 * tests/evolution/agent-memory-store.integration.test.ts
 *
 * L0 进化引擎 × 真实 SQLite AgentMemoryStore 集成测试。
 *
 * 为什么需要这个文件：
 *   83 个进化引擎单元测试全部使用 mock。mock 不验证 SQLite 约束。
 *   核心差异：SQLite 有 CHECK(type IN (...)) 约束，仅接受 6 种类型：
 *   fact / preference / decision / pattern / entity / enterprise_fact
 *   进化模块使用的 user_correction / threshold_adjustment / evolution_snapshot
 *   不在白名单中。
 *
 * 铁律 33: *.integration.test.ts | 铁律 12: 不 mock 管线
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { AgentMemoryStore } from '../../src/l4/agent-memory-store';

function createRealStore() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  return { db, store: new AgentMemoryStore(db) };
}

// ═══ 1. SQLite 约束验证 ═══

describe('AgentMemoryStore — SQLite 约束', () => {
  let store: AgentMemoryStore;

  beforeEach(() => {
    ({ store } = createRealStore());
  });

  it('有效 type 可写入和读取', () => {
    for (const t of ['fact', 'preference', 'decision', 'pattern', 'entity', 'enterprise_fact'] as const) {
      store.remember({
        orgId: 'org1', key: `k_${t}`, value: 'v',
        type: t, confidence: 0.5, source: 'manual', tags: [],
        expiresAt: null,
      });
      expect(store.recall('org1', `k_${t}`)).not.toBeNull();
    }
  });

  it('无效 type 抛出 SQLITE_CONSTRAINT', () => {
    try {
      store.remember({
        orgId: 'o', key: 'bad', value: 'x',
        type: 'user_correction', confidence: 0.5, source: 'manual', tags: [],
        expiresAt: null,
      });
      expect('should throw').toBe('but did not');
    } catch (err) {
      expect((err as Error).message).toContain('CHECK constraint');
    }
  });

  it('无效 type: evolution_snapshot', () => {
    try {
      store.remember({
        orgId: 'o', key: 'snap', value: '{}',
        type: 'evolution_snapshot', confidence: 1, source: 'manual', tags: [],
        expiresAt: null,
      });
      expect('should throw').toBe('but did not');
    } catch (err) {
      expect((err as Error).message).toContain('CHECK constraint');
    }
  });

  it('租户隔离', () => {
    store.remember({
      orgId: 'orgA', key: 'secret', value: 'A',
      type: 'fact', confidence: 0.5, source: 'manual', tags: [],
      expiresAt: null,
    });
    store.remember({
      orgId: 'orgB', key: 'secret', value: 'B',
      type: 'fact', confidence: 0.5, source: 'manual', tags: [],
      expiresAt: null,
    });
    expect(store.recall('orgA', 'secret')?.value).toBe('A');
    expect(store.recall('orgB', 'secret')?.value).toBe('B');
  });

  it('UPSERT — 同 orgId+key 覆盖', () => {
    store.remember({
      orgId: 'org1', key: 'k', value: 'v1',
      type: 'fact', confidence: 0.5, source: 'manual', tags: [],
      expiresAt: null,
    });
    store.remember({
      orgId: 'org1', key: 'k', value: 'v2',
      type: 'enterprise_fact', confidence: 0.9, source: 'manual', tags: [],
      expiresAt: null,
    });
    expect(store.recall('org1', 'k')?.value).toBe('v2');
  });
});

// ═══ 2. enterprise_fact + tags = 替代方案 ═══

describe('enterprise_fact + tags 替代 custom types', () => {
  let store: AgentMemoryStore;

  beforeEach(() => {
    ({ store } = createRealStore());
  });

  it('用 enterprise_fact + tag 存储 user_correction → tag 可过滤', () => {
    store.remember({
      orgId: 'org1', key: 'c1',
      value: JSON.stringify({ reason: '现金流不符', sentinelId: 'F1' }),
      type: 'enterprise_fact', confidence: 0.8,
      source: 'user_feedback', tags: ['user_correction', 'F1'],
      expiresAt: null,
    });

    // 用 tags: ['user_correction'] 过滤
    const listed = store.list({
      orgId: 'org1', type: 'enterprise_fact',
      tags: ['user_correction'], limit: 10,
    });
    expect(listed.length).toBe(1);
    const parsed = JSON.parse(listed[0].value) as { sentinelId: string };
    expect(parsed.sentinelId).toBe('F1');
  });
});
