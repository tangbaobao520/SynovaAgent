/**
 * tests/store/migrations/002-graph-triples-rebuild.test.ts — P7 graph_triples 整表重建
 *
 * 覆盖（铁律 48: 正常 / 降级 / 边界；本卡 Done ⑥ 验收三条 + 改坏即红）:
 *   1. 判别性基线: **漂移库**（复刻生产库真实 schema）上 `createEdge` 必须失败
 *      —— 这是"改坏即红"的红侧锚点：若迁移被撤掉，后续用例必然跟着红。
 *   2. 迁移后读路径: `SELECT props` 成功、`queryEdges` 不再报缺列。
 *   3. 迁移后写路径: `createEdge` 成功（id 为 `edge-<uuid>` TEXT 写入 TEXT 主键）。
 *   4. 数据搬运: 漂移库已有行 → 迁移后行数不丢、`props_json` → `props` 映射正确。
 *   5. 幂等: 连续两次 `reconcileSchema` 安全（schema_version 被多模块共用 ⇒ 迁移会被反复触发）。
 *   6. 边界-全新库: 无 `graph_triples` 表 → `initSchema` 建 canonical 表（迁移 no-op）。
 *
 * 铁律 33: 单元测试，全部使用 `:memory:` SQLite（Done ⑦: 禁止动 data/synova.db）。
 */
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { reconcileSchema } from '../../../src/store/schema-migration';
import { SqliteGraphStore } from '../../../src/adapters/sqlite-graph-store';

/**
 * 复刻**生产库实际**的漂移 schema（2026-09-25 实测，只读 `.schema graph_triples` 逐字抄录）。
 * 与 canonical 的差异: id = INTEGER PK AUTOINCREMENT；无 `props`（只有 `props_json`）；
 * `graph` 无 DEFAULT；多出 `confidence` / `source`。
 */
const LEGACY_DRIFT_DDL = `
CREATE TABLE graph_triples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_type TEXT NOT NULL, subject_id TEXT NOT NULL,
  predicate TEXT NOT NULL, object_type TEXT NOT NULL, object_id TEXT NOT NULL,
  graph TEXT NOT NULL, weight REAL DEFAULT 1.0,
  props_json TEXT DEFAULT '{}', confidence REAL DEFAULT 1.0, source TEXT,
  valid_from TEXT NOT NULL DEFAULT (datetime('now')), valid_to TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_gt_subject ON graph_triples(graph, subject_type, subject_id);
CREATE INDEX idx_gt_object ON graph_triples(graph, object_type, object_id);
CREATE INDEX idx_gt_predicate ON graph_triples(graph, predicate);
CREATE INDEX idx_gt_weight ON graph_triples(graph, predicate, weight);
CREATE INDEX idx_gt_valid ON graph_triples(graph, valid_from, valid_to);
`;

/** 复刻生产库 `graph_nodes`（含 `props`，故不需要图节点侧重建） */
const LEGACY_NODES_DDL = `
CREATE TABLE graph_nodes (
  id TEXT NOT NULL, type TEXT NOT NULL, graph TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '', confidence REAL DEFAULT 1.0,
  props_json TEXT DEFAULT '{}', created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  valid_to TEXT, props TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (id, graph)
);
`;

function makeDriftedDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(LEGACY_NODES_DDL);
  db.exec(LEGACY_DRIFT_DDL);
  return db;
}

/** 判别性锚点：写路径在漂移库上**必然**失败（缺 props 列） */
function createEdgeOnDriftedDb(db: Database.Database): void {
  db.prepare(
    `INSERT INTO graph_triples
       (id, graph, subject_type, subject_id, predicate, object_type, object_id, weight, props)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run('edge-abc', 'default', 'Company', 'c1', 'DEPLOYS', 'Tool', 't1', 1.0, '{}');
}

describe('P7 graph_triples 整表重建（002）', () => {
  it('判别性红侧：漂移库上写路径失败（缺 props 列）——迁移是负载项', () => {
    const db = makeDriftedDb();
    expect(() => createEdgeOnDriftedDb(db)).toThrowError(/no column named props/);
    db.close();
  });

  it('迁移后：读路径通（SELECT props 成功、queryEdges 不报缺列）', () => {
    const db = makeDriftedDb();
    reconcileSchema(db);

    // 直接 SQL 读（P7 验收 (a)）
    const cols = db.pragma("table_info(graph_triples)") as Array<{ name: string; type: string }>;
    expect(cols.some((c) => c.name === 'props')).toBe(true);
    expect(cols.find((c) => c.name === 'id')?.type.toUpperCase()).toBe('TEXT');
    expect(() => db.prepare('SELECT props FROM graph_triples').all()).not.toThrow();

    // 经 store 读（P7 验收 (b): 不再报 no such column: props）
    const store = new SqliteGraphStore(db as never);
    expect(store.queryEdges('DEPLOYS', undefined, undefined, 'default')).toEqual([]);
    db.close();
  });

  it('迁移后：写路径通（createEdge 读写全通）——P7 验收 (c)', () => {
    const db = makeDriftedDb();
    reconcileSchema(db);
    const store = new SqliteGraphStore(db as never);

    const from = store.createNode('Company', { name: '示例公司' }, 'default');
    const to = store.createNode('Tool', { name: '示例工具' }, 'default');
    const edgeId = store.createEdge('DEPLOYS', from, to, 2.5, { note: 'p7' }, 'default');

    expect(edgeId.startsWith('edge-')).toBe(true);
    const edges = store.queryEdges('DEPLOYS', from, to, 'default');
    expect(edges).toHaveLength(1);
    expect(edges[0].id).toBe(edgeId);
    expect(edges[0].weight).toBe(2.5);
    expect(edges[0].props).toEqual({ note: 'p7' });
    db.close();
  });

  it('数据搬运：漂移库既有行不丢，props_json → props 映射正确', () => {
    const db = makeDriftedDb();
    db.prepare(
      `INSERT INTO graph_triples
         (subject_type, subject_id, predicate, object_type, object_id, graph, weight, props_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('Company', 'c9', 'OWNS', 'Asset', 'a9', 'default', 3.0, '{"legacy":true}');

    reconcileSchema(db);

    const rows = db.prepare('SELECT id, graph, props, weight FROM graph_triples').all() as Array<{
      id: string;
      graph: string;
      props: string;
      weight: number;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].graph).toBe('default');
    expect(rows[0].weight).toBe(3.0);
    expect(JSON.parse(rows[0].props)).toEqual({ legacy: true });
    expect(typeof rows[0].id).toBe('string'); // INTEGER → TEXT
    db.close();
  });

  it('幂等：连续两次 reconcileSchema 不报错、不重复搬行', () => {
    const db = makeDriftedDb();
    db.prepare(
      `INSERT INTO graph_triples (subject_type, subject_id, predicate, object_type, object_id, graph)
       VALUES ('Company','c1','DEPLOYS','Tool','t1','default')`,
    ).run();

    reconcileSchema(db);
    expect(() => reconcileSchema(db)).not.toThrow();
    const n = db.prepare('SELECT COUNT(*) AS n FROM graph_triples').get() as { n: number };
    expect(n.n).toBe(1);
    db.close();
  });

  it('边界-全新库：无 graph_triples 表 → 迁移 no-op，initSchema 建 canonical 表', () => {
    const db = new Database(':memory:');
    expect(() => reconcileSchema(db)).not.toThrow();
    expect(
      (db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='graph_triples'").get() as { n: number }).n,
    ).toBe(0);

    const store = new SqliteGraphStore(db as never); // 构造器 → initSchema + reconcileSchema
    const a = store.createNode('Company', { name: 'A' }, 'default');
    const b = store.createNode('Tool', { name: 'B' }, 'default');
    const eid = store.createEdge('USES', a, b, 1, {}, 'default');
    expect(store.queryEdges('USES', a, b, 'default').map((e) => e.id)).toEqual([eid]);
    db.close();
  });

  it('形态守卫：graph_triples 非 TABLE（视图）→ fail-closed 抛错，不静默跳过', () => {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE base_t (x TEXT)');
    db.exec('CREATE VIEW graph_triples AS SELECT x AS id FROM base_t');
    expect(() => reconcileSchema(db)).toThrowError(/不是 TABLE/);
    db.close();
  });
});
