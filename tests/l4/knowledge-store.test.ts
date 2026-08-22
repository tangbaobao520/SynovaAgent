/**
 * tests/l4/knowledge-store.test.ts — KnowledgeStore.recentStats 单元测试 (D475)
 *
 * 铁律 48: 测试必须有 expect() 断言
 * 覆盖: 时间窗口计数 / 分域分源分组 / 双格式归一（ISO + datetime('now')）/ 窗口外排除 / 空库
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { KnowledgeStore } from '../../src/l4/knowledge-store';

let db: Database.Database;
let store: KnowledgeStore;

beforeEach(() => {
  db = new Database(':memory:');
  store = new KnowledgeStore(db);
});

/** 直接 SQL 插入（绕过 insert() 的 now 时间戳，可控制 created_at） */
function insertRaw(row: {
  id: string; text?: string; sourceType?: string; sourceId?: string;
  pkbDomain?: string; createdAt: string;
}): void {
  db.prepare(`
    INSERT INTO knowledge_chunks (id, text, source_type, source_id, access_level,
      access_sensitivity, pkb_domain, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(
    row.id, row.text ?? 'test text', row.sourceType ?? 'document', row.sourceId ?? 'src-1',
    'private', 'normal', row.pkbDomain ?? null, row.createdAt, row.createdAt,
  );
}

describe('KnowledgeStore.recentStats (D475 loop-5 时间窗口统计)', () => {
  it('窗口内条目计入 total 且分域分组', () => {
    const since = '2026-08-01T00:00:00.000Z';
    insertRaw({ id: 'k1', pkbDomain: 'finance', createdAt: '2026-08-10T00:00:00.000Z' });
    insertRaw({ id: 'k2', pkbDomain: 'marketing', createdAt: '2026-08-15T00:00:00.000Z' });
    insertRaw({ id: 'k3', pkbDomain: 'finance', createdAt: '2026-08-20T00:00:00.000Z' });

    const stats = store.recentStats(since);

    expect(stats.total).toBe(3);
    expect(stats.byDomain).toEqual({ finance: 2, marketing: 1 });
    expect(stats.bySourceType).toEqual({ document: 3 });
  });

  it('窗口外条目排除（created_at 早于 since）', () => {
    const since = '2026-08-10T00:00:00.000Z';
    insertRaw({ id: 'k1', createdAt: '2026-08-09T23:59:59.000Z' });
    insertRaw({ id: 'k2', createdAt: '2026-08-11T00:00:00.000Z' });

    const stats = store.recentStats(since);

    expect(stats.total).toBe(1);
    expect(stats.byDomain).toEqual({});
  });

  it('datetime("now") 格式与 ISO 格式双归一计数', () => {
    const since = '2026-08-15T00:00:00.000Z';
    insertRaw({ id: 'k1', createdAt: '2026-08-16T00:00:00.000Z' });
    // 直接写入 SQLite datetime('now') 默认格式（schema DEFAULT 的产物）
    db.prepare(`
      INSERT INTO knowledge_chunks (id, text, source_type, source_id, access_level,
        access_sensitivity, created_at, updated_at)
      VALUES (?,?,?,?,?,?,datetime('now'),datetime('now'))
    `).run('k2', 'legacy format', 'message', 'src-2', 'private', 'normal');

    const stats = store.recentStats(since);

    // 2026-08-15 窗口内：ISO 条目 + datetime('now') 条目都应计入（now 远晚于 since）
    expect(stats.total).toBe(2);
    expect(stats.bySourceType).toEqual({ document: 1, message: 1 });
  });

  it('空库 → total=0', () => {
    const stats = store.recentStats('2026-08-01T00:00:00.000Z');

    expect(stats.total).toBe(0);
    expect(Object.keys(stats.byDomain)).toHaveLength(0);
    expect(Object.keys(stats.bySourceType)).toHaveLength(0);
  });
});
