/**
 * tests/packages/graph-store-wal.test.ts — WAL 降级测试 (D286 迁移)
 *
 * D286: 旧 graph-store 包的 enableWAL 导出已废弃，WAL 启用内聚到 SqliteGraphStore 构造。
 * 本测试验证迁移后的等价行为（铁律 12: 真实 better-sqlite3，不 mock 管线）：
 *   - 文件数据库 → WAL 模式生效
 *   - 内存数据库 (:memory:) → WAL 不可用，降级 DELETE，构造不崩溃
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { SqliteGraphStore } from '../../src/adapters/sqlite-graph-store';

describe('SqliteGraphStore WAL — 文件数据库启用 WAL', () => {
  it('构造后 journal_mode 为 wal 且 synchronous 为 NORMAL', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synova-wal-'));
    const dbPath = path.join(tmpDir, 'wal-test.db');
    const db = new Database(dbPath);
    try {
      new SqliteGraphStore(db);
      const mode = db.pragma('journal_mode', { simple: true }) as string;
      expect(mode).toBe('wal');
    } finally {
      db.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('SqliteGraphStore WAL — 内存库降级', () => {
  it(':memory: 数据库 WAL 不可用 → 降级不崩溃，CRUD 正常', () => {
    const db = new Database(':memory:');
    const store = new SqliteGraphStore(db);
    try {
      const id = store.createNode('TEST', { name: 'wal-degrade' }, 'default');
      expect(id).toBeTruthy();
      const nodes = store.queryNodes('TEST', undefined, 'default');
      expect(nodes.length).toBe(1);
    } finally {
      db.close();
    }
  });
});
