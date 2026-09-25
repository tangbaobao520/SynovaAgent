/**
 * src/store/migrations/002-graph-triples-rebuild.ts — P7: graph_triples 整表重建回 canonical
 *
 * 背景（实测，2026-09-25）: 生产库 `graph_triples` 的**表结构**与 canonical
 * （`src/adapters/sqlite-graph-store.ts` SCHEMA_SQL）漂移，导致**读写路径双双失效**：
 *   - 生产实际: `id INTEGER PRIMARY KEY AUTOINCREMENT` ／ **无 `props`**（只有 `props_json`）／
 *               `graph TEXT NOT NULL`（无 DEFAULT）／多出 `confidence` / `source`
 *   - canonical: `id TEXT PRIMARY KEY` ／ `props TEXT NOT NULL DEFAULT '{}'` ／
 *                `graph TEXT NOT NULL DEFAULT 'default'`
 *   ⇒ 读: `queryEdges` `SELECT … props FROM graph_triples` → `no such column: props`（被 catch 吞成"无边"）
 *   ⇒ 写: `createEdge` `INSERT … (id, …, props)` → `table graph_triples has no column named props`
 *   ⇒ **只 `ALTER TABLE ADD COLUMN props` 修不好写路径**：`createEdge` 写 `id='edge-<uuid>'`(TEXT)
 *      进 `INTEGER PRIMARY KEY AUTOINCREMENT` 列 → `datatype mismatch`。
 *   ⇒ 故正解 = **整表重建**（TEXT 主键 + props），并把旧行按列映射搬过去。
 *
 * 契约（铁律 47）:
 *   @input  — better-sqlite3 Database 实例（可能含漂移版 graph_triples，亦可能为全新库）
 *   @output — void；成功后 `graph_triples` 与 canonical 逐列一致（含 5 个索引），旧行已按
 *             `props_json → props`、`id → CAST(id AS TEXT)` 迁移，行数不丢
 *   @degraded — `graph_triples` **不存在**（全新库）→ no-op（`initSchema` 会建 canonical 表）；
 *               已是 canonical（`props` 存在且 `id` 为 TEXT）→ no-op（**幂等**，重复执行安全，
 *               因 `schema_version` 表被多模块共用、`ORDER BY updated_at DESC LIMIT 1` 可能读到
 *               非数字行 ⇒ 迁移会被反复触发，幂等是硬要求）
 *   @error  — `graph_triples` 存在但不是 TABLE（如视图）→ 抛错（fail-closed，迁移失败必须阻止启动）
 *             重建过程任一步失败 → 事务回滚（不留半成品表）
 */
import type Database from 'better-sqlite3';
import type { Migration } from '../schema-migration';

/** canonical `graph_triples` DDL（与 sqlite-graph-store.ts SCHEMA_SQL 同源逐字一致） */
const CANONICAL_DDL = `
CREATE TABLE graph_triples (
  id TEXT PRIMARY KEY,
  graph TEXT NOT NULL DEFAULT 'default',
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  predicate TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_id TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1.0,
  props TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  valid_from TEXT NOT NULL DEFAULT (datetime('now')),
  valid_to TEXT
)`;

/** canonical 索引（与 SCHEMA_SQL 同名同定义） */
const CANONICAL_INDEXES = [
  `CREATE INDEX idx_gt_subject ON graph_triples(graph, subject_type, subject_id)`,
  `CREATE INDEX idx_gt_object ON graph_triples(graph, object_type, object_id)`,
  `CREATE INDEX idx_gt_predicate ON graph_triples(graph, predicate)`,
  `CREATE INDEX idx_gt_weight ON graph_triples(graph, predicate, weight)`,
  `CREATE INDEX idx_gt_valid ON graph_triples(graph, valid_from, valid_to)`,
];

/** 重建时用到的中间表名（带前缀，避免与任何既有表撞名） */
const LEGACY = 'graph_triples_p7_legacy';

export const graphTriplesRebuildMigration: Migration = {
  version: 3,
  name: 'graph-triples-rebuild',
  up: (db: Database.Database): void => {
    // ① 表存在性 + 形态守卫
    const obj = db
      .prepare("SELECT type FROM sqlite_master WHERE name = 'graph_triples'")
      .get() as { type?: string } | undefined;
    if (!obj) return; // 全新库: initSchema 将创建 canonical 表
    if (obj.type !== 'table') {
      throw new Error(`graph_triples 存在但不是 TABLE（type=${obj.type}）—— P7 迁移无法安全重建`);
    }

    // ② 幂等 + 漂移判定
    const cols = db.pragma('table_info(graph_triples)') as Array<{ name: string; type: string }>;
    const byName = new Map(cols.map((c) => [c.name, c]));
    const idType = (byName.get('id')?.type ?? '').toUpperCase();
    const isCanonical = byName.has('props') && idType === 'TEXT';
    if (isCanonical) return; // 已 canonical → no-op（幂等）

    // ③ 逐列构造搬运表达式（对旧表**缺列**保持鲁棒：缺列则用 canonical 默认值）
    const castText = (col: string, dflt: string): string =>
      byName.has(col) ? `CAST(${col} AS TEXT)` : dflt;
    const plain = (col: string, dflt: string): string => (byName.has(col) ? col : dflt);
    // 属性源：新库命名 props；漂移库命名 props_json —— 优先 props，回退 props_json
    const propsExpr = byName.has('props')
      ? `COALESCE(props, '{}')`
      : byName.has('props_json')
        ? `COALESCE(props_json, '{}')`
        : `'{}'`;

    const selectList = [
      castText('id', `'edge-' || lower(hex(randomblob(16)))`),
      `COALESCE(${plain('graph', `'default'`)}, 'default')`,
      plain('subject_type', `''`),
      plain('subject_id', `''`),
      plain('predicate', `''`),
      plain('object_type', `''`),
      plain('object_id', `''`),
      `COALESCE(${plain('weight', '1.0')}, 1.0)`,
      propsExpr,
      `COALESCE(${plain('created_at', `datetime('now')`)}, datetime('now'))`,
      // 旧表无 valid_from（实测漂移库确实缺）→ 用 created_at 兜底，保持时间线语义
      `COALESCE(${plain('valid_from', plain('created_at', `datetime('now')`))}, datetime('now'))`,
      plain('valid_to', 'NULL'),
    ].join(', ');

    const rebuild = db.transaction((): void => {
      db.exec(`DROP TABLE IF EXISTS ${LEGACY}`);
      db.exec(`ALTER TABLE graph_triples RENAME TO ${LEGACY}`);
      db.exec(CANONICAL_DDL);
      db.exec(
        `INSERT INTO graph_triples
           (id, graph, subject_type, subject_id, predicate, object_type, object_id,
            weight, props, created_at, valid_from, valid_to)
         SELECT ${selectList} FROM ${LEGACY}`,
      );
      // 先 DROP 旧表（连带释放其上的 idx_gt_* 旧索引名），再建 canonical 索引；
      // 顺序反了会因索引**同名冲突**导致 `CREATE INDEX` 静默失败（IF NOT EXISTS）→ 新表无索引。
      db.exec(`DROP TABLE ${LEGACY}`);
      for (const idx of CANONICAL_INDEXES) db.exec(idx);
    });

    rebuild();
  },
};
