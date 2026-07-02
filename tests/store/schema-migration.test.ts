/**
 * tests/store/schema-migration.test.ts — Phase 3.2 Schema 迁移测试
 *
 * 铁律 33: *.test.ts 单元测试 (使用 :memory: SQLite)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';

let reconcileSchema: any;
let SCHEMA_VERSION: number;

async function loadModules() {
  const mod = await import('../../src/store/schema-migration');
  reconcileSchema = mod.reconcileSchema;
  SCHEMA_VERSION = mod.SCHEMA_VERSION;
}

function createTestDb(): Database.Database {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const BetterSqlite3 = require('better-sqlite3');
  const db = new BetterSqlite3(':memory:');
  db.pragma('journal_mode = WAL');
  return db;
}

describe('SchemaMigration — 初始化', () => {
  beforeEach(async () => { await loadModules(); });

  it('SCHEMA_VERSION 应 >= 1', () => {
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(1);
  });

  it('reconcileSchema 应创建 schema_version 表', () => {
    const db = createTestDb();
    reconcileSchema(db);

    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'").all();
    expect(rows).toHaveLength(1);
  });

  it('首次调用应写入版本号', () => {
    const db = createTestDb();
    reconcileSchema(db);

    const row = db.prepare('SELECT version FROM schema_version').get() as any;
    expect(row.version).toBe(SCHEMA_VERSION);
  });
});

describe('SchemaMigration — 幂等', () => {
  beforeEach(async () => { await loadModules(); });

  it('重复调用不应报错', () => {
    const db = createTestDb();
    reconcileSchema(db);
    reconcileSchema(db);

    const row = db.prepare('SELECT version FROM schema_version').get() as any;
    expect(row.version).toBe(SCHEMA_VERSION);
  });

  it('已有 schema_version 表应跳过创建', () => {
    const db = createTestDb();
    db.exec('CREATE TABLE schema_version (version INTEGER NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime(\'now\')))');
    db.prepare('INSERT INTO schema_version (version, updated_at) VALUES (?, datetime(\'now\'))').run(SCHEMA_VERSION);

    reconcileSchema(db);

    const row = db.prepare('SELECT version FROM schema_version').get() as any;
    expect(row.version).toBe(SCHEMA_VERSION);
  });
});
