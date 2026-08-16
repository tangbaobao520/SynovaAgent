/**
 * tests/store/migrations/001-graph-nodes-props.test.ts — D355 迁移 001 单测
 *
 * 铁律 33: *.test.ts 单元测试 (使用 :memory: SQLite)
 * 铁律 48: 真实断言 — 正常路径（回填）/ 降级路径（NULL/空/缺表）/ 边界（幂等/视图）
 */
import { describe, it, expect } from 'vitest';
import type Database from 'better-sqlite3';
import { graphNodesPropsMigration } from '../../../src/store/migrations/001-graph-nodes-props';

function createDb(): Database.Database {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const BetterSqlite3 = require('better-sqlite3');
  return new BetterSqlite3(':memory:') as Database.Database;
}

/** 旧库 graph_nodes: 有 props_json 列、无 props 列（K3 P0-3 实测形态） */
function createLegacyGraphNodes(db: Database.Database): void {
  db.exec(`
    CREATE TABLE graph_nodes (
      id TEXT PRIMARY KEY,
      graph TEXT NOT NULL DEFAULT 'default',
      type TEXT NOT NULL,
      name TEXT,
      props_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      valid_from TEXT NOT NULL DEFAULT (datetime('now')),
      valid_to TEXT
    )
  `);
}

function tableColumns(db: Database.Database): string[] {
  return (db.pragma('table_info(graph_nodes)') as Array<{ name: string }>).map((c) => c.name);
}

describe('001-graph-nodes-props — 旧库回填（正常路径）', () => {
  it('props_json 数据原样回填到新 props 列', () => {
    const db = createDb();
    createLegacyGraphNodes(db);
    db.prepare("INSERT INTO graph_nodes (id, type, props_json) VALUES ('n1', 'Client', ?)").run('{"market_share":42}');

    graphNodesPropsMigration.up(db);

    expect(tableColumns(db)).toContain('props');
    const row = db.prepare("SELECT props FROM graph_nodes WHERE id = 'n1'").get() as { props: string };
    expect(JSON.parse(row.props)).toEqual({ market_share: 42 });
  });

  it('props_json 为 NULL 的行回填默认 {}', () => {
    const db = createDb();
    createLegacyGraphNodes(db);
    db.prepare("INSERT INTO graph_nodes (id, type, props_json) VALUES ('n1', 'Client', NULL)").run();

    graphNodesPropsMigration.up(db);

    const row = db.prepare("SELECT props FROM graph_nodes WHERE id = 'n1'").get() as { props: string };
    expect(row.props).toBe('{}');
  });

  it('props_json 为空串的行回填默认 {}，有值行保留原值', () => {
    const db = createDb();
    createLegacyGraphNodes(db);
    db.prepare("INSERT INTO graph_nodes (id, type, props_json) VALUES ('n1', 'Client', ''), ('n2', 'Person', ?)").run('{"headcount":10}');

    graphNodesPropsMigration.up(db);

    const rows = db.prepare("SELECT props FROM graph_nodes ORDER BY id").all() as Array<{ props: string }>;
    expect(rows[0].props).toBe('{}');
    expect(JSON.parse(rows[1].props)).toEqual({ headcount: 10 });
  });
});

describe('001-graph-nodes-props — 幂等与边界', () => {
  it('props 列已存在 → no-op（列不重复、现有 props 不被 props_json 覆盖）', () => {
    const db = createDb();
    createLegacyGraphNodes(db);
    db.prepare("INSERT INTO graph_nodes (id, type, props_json) VALUES ('n1', 'Client', '{\"a\":1}')").run();
    db.exec("ALTER TABLE graph_nodes ADD COLUMN props TEXT NOT NULL DEFAULT '{}'");
    db.prepare("UPDATE graph_nodes SET props = '{\"b\":2}' WHERE id = 'n1'").run();
    const colsBefore = tableColumns(db);

    expect(() => graphNodesPropsMigration.up(db)).not.toThrow();

    expect(tableColumns(db)).toEqual(colsBefore);
    const row = db.prepare("SELECT props FROM graph_nodes WHERE id = 'n1'").get() as { props: string };
    expect(row.props).toBe('{"b":2}');
  });

  it('graph_nodes 不存在（全新库）→ no-op 不抛错、不建表', () => {
    const db = createDb();

    expect(() => graphNodesPropsMigration.up(db)).not.toThrow();

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>;
    expect(tables.map((t) => t.name)).not.toContain('graph_nodes');
  });

  it('graph_nodes 是视图（异常 schema）→ 抛错 fail-closed', () => {
    const db = createDb();
    db.exec("CREATE VIEW graph_nodes AS SELECT 1 AS id, 'Client' AS type, NULL AS props_json");

    expect(() => graphNodesPropsMigration.up(db)).toThrow();
  });
});
