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

    // D967: 用 MAX(version) 而非"第一行" —— reconcileSchema 会为**每个**迁移各插一行
    // （版本 2/3/4…），无 ORDER BY 的裸 SELECT 只拿到最早那条 ⇒ 迁移一增就假红。
    const row = db.prepare('SELECT MAX(version) AS version FROM schema_version').get() as any;
    expect(row.version).toBe(SCHEMA_VERSION);
  });
});

describe('SchemaMigration — 幂等', () => {
  beforeEach(async () => { await loadModules(); });

  it('重复调用不应报错', () => {
    const db = createTestDb();
    reconcileSchema(db);
    reconcileSchema(db);

    const row = db.prepare('SELECT MAX(version) AS version FROM schema_version').get() as any;
    expect(row.version).toBe(SCHEMA_VERSION);
  });

  it('已有 schema_version 表应跳过创建', () => {
    const db = createTestDb();
    db.exec('CREATE TABLE schema_version (version INTEGER NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime(\'now\')))');
    db.prepare('INSERT INTO schema_version (version, updated_at) VALUES (?, datetime(\'now\'))').run(SCHEMA_VERSION);

    reconcileSchema(db);

    const row = db.prepare('SELECT MAX(version) AS version FROM schema_version').get() as any;
    expect(row.version).toBe(SCHEMA_VERSION);
  });
});

describe('SchemaMigration — D355 及后续迁移的版本轴', () => {
  beforeEach(async () => { await loadModules(); });

  it('SCHEMA_VERSION 应为有效数值且 >= 2（含 D355 迁移）', () => {
    // D967: 不写死具体版本号 —— 每加一个迁移就要改断言 = 下次必然再假红（D965 同类教训）
    expect(Number.isInteger(SCHEMA_VERSION)).toBe(true);
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(2);
  });

  it('旧库（props_json 无 props）reconcile 后补 props 列并回填数据', () => {
    const db = createTestDb();
    db.exec(`
      CREATE TABLE graph_nodes (
        id TEXT PRIMARY KEY, graph TEXT NOT NULL DEFAULT 'default', type TEXT NOT NULL, name TEXT,
        props_json TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
        valid_from TEXT NOT NULL DEFAULT (datetime('now')), valid_to TEXT
      )
    `);
    db.prepare("INSERT INTO graph_nodes (id, type, props_json) VALUES ('n1', 'Client', ?)").run('{"churn_rate":0.12}');

    reconcileSchema(db);

    const props = (db.prepare("SELECT props FROM graph_nodes WHERE id = 'n1'").get() as { props: string }).props;
    expect(JSON.parse(props)).toEqual({ churn_rate: 0.12 });
  });

  it('schema_version 已到 v1 的库增量执行 v2 并推进版本', () => {
    const db = createTestDb();
    db.exec("CREATE TABLE schema_version (version INTEGER NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')))");
    db.prepare("INSERT INTO schema_version (version) VALUES (1)").run();
    db.exec(`
      CREATE TABLE graph_nodes (
        id TEXT PRIMARY KEY, graph TEXT NOT NULL DEFAULT 'default', type TEXT NOT NULL, name TEXT,
        props_json TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
        valid_from TEXT NOT NULL DEFAULT (datetime('now')), valid_to TEXT
      )
    `);

    reconcileSchema(db);

    const versions = (db.prepare('SELECT version FROM schema_version').all() as Array<{ version: number }>).map((r) => r.version);
    expect(versions).toContain(2);
  });

  it('v2 迁移失败必须抛（fail-closed — 迁移失败阻止启动）', () => {
    const db = createTestDb();
    db.exec("CREATE VIEW graph_nodes AS SELECT 1 AS id, 'Client' AS type, NULL AS props_json");

    expect(() => reconcileSchema(db)).toThrow();
  });
});

// ═══ D967 新增: schema_version 表被多模块污染的判别性回归 ═══
describe('SchemaMigration — 版本解析抗污染（D967 P7 实测缺陷）', () => {
  beforeEach(async () => { await loadModules(); });

  /**
   * 实测背景: 生产库 `schema_version` 被多模块共用，行内混有**文本**标记
   * （`d93b_actor_role` / `d551_memory_type`）。原实现取 `ORDER BY updated_at DESC LIMIT 1`
   * ⇒ 读到文本 → `m.version > 'd93b_actor_role'` 为 NaN 比较 ⇒ **pending 恒空**
   * ⇒ 只写版本号、**一个迁移都不跑**（迁移静默失效的假绿）。
   */
  function makePollutedDb(): Database.Database {
    const db = createTestDb();
    db.exec("CREATE TABLE schema_version (version INTEGER NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')))");
    // 漂移版 graph_triples（复刻生产：id INTEGER PK、无 props）—— 版本 3 的迁移目标
    db.exec(`CREATE TABLE graph_triples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_type TEXT NOT NULL, subject_id TEXT NOT NULL, predicate TEXT NOT NULL,
      object_type TEXT NOT NULL, object_id TEXT NOT NULL, graph TEXT NOT NULL,
      weight REAL DEFAULT 1.0, props_json TEXT DEFAULT '{}', source TEXT,
      valid_from TEXT NOT NULL DEFAULT (datetime('now')), valid_to TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
    // 文本行**最新**（正是触发缺陷的形态）；数值行最大 = 2 ⇒ 版本 3/4 仍应执行
    db.prepare("INSERT INTO schema_version (version, updated_at) VALUES ('d93b_actor_role', '2099-01-01 00:00:00')").run();
    db.prepare("INSERT INTO schema_version (version, updated_at) VALUES (2, '2020-01-01 00:00:00')").run();
    return db;
  }

  it('最新一行是文本版本标记时，>当前数值版本的迁移仍必须执行（不得静默空转）', () => {
    const db = makePollutedDb();
    reconcileSchema(db);

    // 版本 3 的产物：graph_triples 被重建为 canonical（有 props、id 为 TEXT）
    // 若 pending 因文本版本恒空 ⇒ 不会重建 ⇒ 本断言红（判别性）
    const cols = db.pragma('table_info(graph_triples)') as Array<{ name: string; type: string }>;
    expect(cols.some((c) => c.name === 'props')).toBe(true);
    expect((cols.find((c) => c.name === 'id')?.type ?? '').toUpperCase()).toBe('TEXT');
    db.close();
  });

  it('版本解析取"数值行最大值"，不受文本行影响', () => {
    const db = makePollutedDb();
    reconcileSchema(db);
    reconcileSchema(db); // 幂等复跑
    const numeric = (db.prepare("SELECT version FROM schema_version WHERE typeof(version) IN ('integer','real')").all() as Array<{ version: number }>).map((r) => r.version);
    expect(Math.max(...numeric)).toBe(SCHEMA_VERSION);
    expect(numeric).toContain(SCHEMA_VERSION);
    db.close();
  });

  it('判别性: 污染库上 measurements 表也必须被建出（P7 同源守卫）', () => {
    const db = makePollutedDb();
    reconcileSchema(db);
    const t = db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='measurements'").get() as { n: number };
    expect(t.n).toBe(1);
    db.close();
  });
});
