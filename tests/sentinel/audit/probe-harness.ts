/**
 * tests/sentinel/audit/probe-harness.ts — D966「空转/零调用」独立复现探针夹具
 *
 * 目的：为 D966 提供**可复跑、可证伪**的运行时口径，用于产出三类清单
 *      （真算的 / 空转的（不读数据）/ 缺件的），并显式测量 P7 混杂变量
 *      （生产库 graph_triples 缺 props 列 ⇒ 边读写路径全失效）。
 *
 * 本卡红线：**只测量，不修改任何哨兵、不改 src/**。本文件仅新增于 tests/sentinel/audit/**。
 *
 * 契约（铁律 47）:
 *   @input  — ProbeOptions:
 *               dbPath        : 夹具 SQLite 路径（**必须落在 os.tmpdir() 下**，生产库只读快照）
 *               teamId        : 传给 aggregate.check 的第 2 参（默认 'probe-team'）
 *               entryPointMode: 'manifest' = 尊重 manifest.entryPoint（loader 口径）
 *                               'aggregate' = 硬编码 ./aggregate.ts（CTO 口径复刻）
 *               exportKeyMode : 'manifest' = 尊重 manifest.exportKey（loader 口径）
 *                               'default'  = 取 mod.default
 *               argMode       : 'loader4' = check(store, teamId, traversal, thresholds)
 *                               'cto2'    = check(store, teamId)（无 traversal / 无 thresholds）
 *                               'loader3' = check(store, teamId, traversal)
 *               thresholds    : 'manifest' = 经 resolveThresholds 注入缝取 manifest 基线
 *                               'none'     = 不传（undefined）
 *   @output — ProbeRow[]：每哨兵一行（name / entryPoint / exportKey / rawIsArray / findings 双列
 *             / store 调用与成功失败分计 / error）。**不产出任何"通过"判定。**
 *   @degraded — 单个哨兵抛错或 import 失败 → 记入该行 error，不中断整体（其余行照跑）。
 *   @error  — 夹具前置条件错误（生产库不可读 / 夹具路径不在 tmp / manifest 目录不可读）→ throw。
 *             设计理由：前置失败不能伪装成"零 finding"（否则正是本卡要复现的缺陷模式）。
 *
 * 判据方言无关：本文件不做任何 "关键字 grep 即通过" 的静态判定；
 * 所有分类都基于**运行时实测**（调用计数 + 成功/失败分计 + 原始返回值形态）。
 */

import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';
import { SqliteGraphStore } from '../../../src/adapters/sqlite-graph-store';
import { createGraphTraversal } from '../../../src/l4/graph-traversal';
import { loadSentinels, resolveThresholds } from '../../../src/sentinel/sentinel-loader';
import type { SentinelThresholdPair } from '../../../src/sentinel/types';

/** 仓库根（tests/sentinel/audit → 上溯 3 层） */
export const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

/**
 * 生产库路径（**只读**用途；任何写操作只允许作用于 tmp 副本）。
 *
 * 背景：D966 在 `git worktree`（.synova-wt-D966）内施工，而 `data/` 是 git 外目录，
 * 工作树内不存在 ⇒ 需回落到**主工作树**。回落方式用 git 的 common dir
 * （worktree 的 `.git` 是指向主仓 .git/worktrees/<name> 的文件），
 * 保证拿到的是同仓真实数据资产，而非任意路径。
 *
 * @degraded 无 —— git 不可用或 common dir 解析失败 → 退回 worktree 内路径，
 *           由 snapshotProdDb 的 existsSync 前置检查 fail-closed 报错（不静默）
 */
function resolveProdDb(): string {
  const explicit = process.env.SYNOVA_PROD_DB_CAPTURE;
  if (explicit) return explicit;
  const local = join(REPO_ROOT, 'data', 'synova.db');
  if (existsSync(local)) return local;
  try {
    const commonDir = execFileSync(
      'git',
      ['rev-parse', '--path-format=absolute', '--git-common-dir'],
      { cwd: REPO_ROOT, encoding: 'utf-8' },
    ).trim();
    const mainRoot = dirname(commonDir);
    return join(mainRoot, 'data', 'synova.db');
  } catch {
    return local;
  }
}

export const PROD_DB = resolveProdDb();

/** 单方法调用计量：调用数 / 成功数 / 失败数 / 返回行数 / 首个错误消息 */
export interface MethodTally {
  calls: number;
  ok: number;
  failed: number;
  /** 数组返回值的元素数累加（用于"真的读到了 N 行"这一层） */
  rowsReturned: number;
  firstError: string | null;
}

export interface StoreTally {
  total: number;
  ok: number;
  failed: number;
  byMethod: Record<string, MethodTally>;
}

export function emptyTally(): StoreTally {
  return { total: 0, ok: 0, failed: 0, byMethod: {} };
}

function tally(t: StoreTally, method: string): MethodTally {
  const slot = t.byMethod[method];
  if (slot) return slot;
  const fresh: MethodTally = { calls: 0, ok: 0, failed: 0, rowsReturned: 0, firstError: null };
  t.byMethod[method] = fresh;
  return fresh;
}

/**
 * SQL 层计量 —— **这是 P7 的关键观测面**。
 *
 * 为什么必须下沉到 SQL 层：`SqliteGraphStore.queryEdges()` 内部 try/catch
 * **吞掉** prepare 期错误并 `return []`（src/adapters/sqlite-graph-store.ts:246-262），
 * 只在 `log.warn` 留痕。方法层因此看不到任何异常，调用方无法区分
 * 「图里确实没有边」与「每一次边查询都在 prepare 阶段失败」。
 * 若只在方法层插桩，会得出"41/41 边读全成功"的**假绿**（D966 首轮实测即此坑，已修正并留证）。
 */
export interface SqlTally {
  prepareCalls: number;
  prepareFailed: number;
  /** 失败样本（SQL 前 120 字符 + 错误消息），封顶 10 条 */
  failedStatements: Array<{ sql: string; error: string }>;
}

export function instrumentDatabase(db: Database.Database): { db: Database.Database; sql: SqlTally } {
  const sql: SqlTally = { prepareCalls: 0, prepareFailed: 0, failedStatements: [] };
  const proxy = new Proxy(db, {
    get(obj, prop, receiver) {
      const value = Reflect.get(obj, prop, receiver);
      if (typeof prop !== 'string') return value;
      if (prop === 'prepare' && typeof value === 'function') {
        return (...args: unknown[]): unknown => {
          sql.prepareCalls += 1;
          try {
            return Reflect.apply(value, obj, args);
          } catch (err: unknown) {
            sql.prepareFailed += 1;
            if (sql.failedStatements.length < 10) {
              const text = typeof args[0] === 'string' ? args[0] : '';
              sql.failedStatements.push({
                sql: text.slice(0, 120),
                error: err instanceof Error ? err.message : String(err),
              });
            }
            throw err;
          }
        };
      }
      if (typeof value === 'function') {
        return (...args: unknown[]): unknown => Reflect.apply(value, obj, args);
      }
      return value;
    },
  });
  return { db: proxy as Database.Database, sql };
}

/**
 * 给真实 GraphStore 套一层**只读观测**代理：逐方法计调用/成功/失败，异常原样重抛。
 * @input  target — 任意对象（生产用 SqliteGraphStore 实例）
 * @output { store, tally } — store 行为与 target 逐字节一致（异常、返回值均原样透传）
 * @degraded 无（观测层自身不吞错、不降级）
 * @error 无（不抛；target 抛什么就抛什么）
 */
export function instrumentStore<T extends object>(target: T): { store: T; tally: StoreTally } {
  const t = emptyTally();
  const proxy = new Proxy(target, {
    get(obj, prop, receiver) {
      const value = Reflect.get(obj, prop, receiver);
      if (typeof value !== 'function' || typeof prop !== 'string') {
        return value;
      }
      return (...args: unknown[]): unknown => {
        const slot = tally(t, prop);
        slot.calls += 1;
        t.total += 1;
        try {
          const out = Reflect.apply(value, obj, args);
          slot.ok += 1;
          t.ok += 1;
          if (Array.isArray(out)) slot.rowsReturned += out.length;
          return out;
        } catch (err: unknown) {
          slot.failed += 1;
          t.failed += 1;
          if (slot.firstError === null) {
            slot.firstError = err instanceof Error ? err.message : String(err);
          }
          throw err;
        }
      };
    },
  });
  return { store: proxy as T, tally: t };
}

// ═══ 夹具数据库 ═══

/**
 * graph_triples / graph_nodes 的三种 schema 断面。
 *   legacy      = 生产断面原样（结构漂移态）
 *   props-added = 仅补 props 列（用于证伪"补一列就够了"）
 *   canonical   = 按仓库 SCHEMA_SQL 整表重建
 */
export type SchemaVariant = 'legacy' | 'props-added' | 'canonical';

/**
 * 夹具 schema 来源：
 *   'prod-snapshot'      = 生产库一致性只读快照（**需要 data/synova.db，本地证据跑用**）
 *   'pinned-prod-schema' = 用下方**逐字抄录的生产 DDL** 直接建表（**CI/临时环境用，不依赖数据文件**）
 *
 * 为什么必须两态：`data/synova.db` 被 `.gitignore:3 (data/)` 排除 ⇒ CI checkout 里**没有生产库**，
 * 若夹具硬依赖快照，单测在 CI 必红。两态各自 fail-closed，**不做隐式回退**：
 * 调用方必须显式声明来源，避免"生产库不在 → 悄悄降级成另一个 schema"这种静默降级（铁律 11/31）。
 */
export type SchemaSource = 'prod-snapshot' | 'pinned-prod-schema';

/**
 * 生产 `graph_nodes` DDL —— 逐字抄录自 `sqlite3 "file:…?mode=ro" ".schema graph_nodes"`（2026-09-25 实测）。
 * 注意与仓库 `SCHEMA_SQL` 的差异：`id TEXT NOT NULL` + `PRIMARY KEY (id, graph)`（复合主键）。
 */
export const PINNED_PROD_NODES_DDL = `
CREATE TABLE graph_nodes (
  id TEXT NOT NULL, type TEXT NOT NULL, graph TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '', confidence REAL DEFAULT 1.0,
  props_json TEXT DEFAULT '{}', created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  valid_to TEXT, props TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (id, graph)
);
CREATE INDEX idx_gn_type ON graph_nodes(graph, type);
CREATE INDEX idx_gn_name ON graph_nodes(graph, name);
CREATE INDEX idx_gn_valid ON graph_nodes(graph, valid_to);
`;

/**
 * 生产 `graph_triples` DDL —— 逐字抄录自同一 `.schema` 调用（2026-09-25 实测）。
 * 漂移标记（单测断言依赖）：`id INTEGER PRIMARY KEY AUTOINCREMENT` + **无 props 列** + `graph` 无默认值。
 */
export const PINNED_PROD_TRIPLES_DDL = `
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

export interface NodeSpec {
  id: string;
  type: string;
  graph: string;
  name?: string;
  props?: Record<string, unknown>;
}

export interface EdgeSpec {
  subjectType: string;
  subjectId: string;
  predicate: string;
  objectType: string;
  objectId: string;
  graph: string;
}

/** 断言夹具路径在 tmp 下：生产库永不被本文件写入 */
function assertTmpPath(p: string): void {
  const tmp = tmpdir();
  if (!p.startsWith(tmp)) {
    throw new Error(`D966 前置条件失败：夹具路径必须位于 ${tmp} 之下，收到 ${p}`);
  }
}

/**
 * 从生产库做一致性只读快照（better-sqlite3 backup，等价 sqlite3 .backup）。
 * 注：better-sqlite3 的 `backup()` 返回 Promise —— 必须 await，否则副本尚未落盘
 *     就被打开（D966 实测踩到：`no such table: graph_nodes` 假象；已修正并留证）。
 * @input  dest — tmp 下的目标路径
 * @output Promise<void>；resolve 时 dest 已是生产库一致性副本
 * @degraded 无
 * @error  生产库不存在 / dest 不在 tmp → throw（前置条件，fail-closed）
 */
export async function snapshotProdDb(dest: string): Promise<void> {
  assertTmpPath(dest);
  if (!existsSync(PROD_DB)) {
    throw new Error(`D966 前置条件失败：生产库不存在 ${PROD_DB}`);
  }
  mkdirSync(dirname(dest), { recursive: true });
  const src = new Database(PROD_DB, { readonly: true, fileMustExist: true });
  try {
    await src.backup(dest);
  } finally {
    src.close();
  }
}

/** 生产库 graph_triples 现状（只读探针用） */
export function inspectProdSchema(dbPath: string = PROD_DB): {
  nodesColumnNames: string[];
  triplesColumnNames: string[];
  nodeCount: number;
  edgeCount: number;
  triplesDdl: string;
  nodesDdl: string;
} {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const cols = (table: string): string[] =>
      (db.pragma(`table_info(${table})`) as Array<{ name: string }>).map((c) => c.name);
    const nodeRow = db.prepare('SELECT COUNT(*) AS n FROM graph_nodes').get() as { n: number };
    const edgeRow = db.prepare('SELECT COUNT(*) AS n FROM graph_triples').get() as { n: number };
    const ddl = (t: string): string => {
      const row = db
        .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
        .get(t) as { sql?: string } | undefined;
      return (row?.sql ?? '').replace(/\s+/g, ' ').trim();
    };
    return {
      nodesColumnNames: cols('graph_nodes'),
      triplesColumnNames: cols('graph_triples'),
      nodeCount: nodeRow.n,
      edgeCount: edgeRow.n,
      triplesDdl: ddl('graph_triples'),
      nodesDdl: ddl('graph_nodes'),
    };
  } finally {
    db.close();
  }
}

/**
 * 构造合成图夹具：生产 schema 快照 + 指定边断面 + 合成节点/边。
 *
 * 边写入**绕过 createEdge**（因为 createEdge 在本断面本身就是坏的，见 run-p7-control.ts）
 * —— 用直连 SQL 写入，模拟"数据已存在（历史写入 / 迁移回填），但读路径是否可用"。
 * 这样两种断面（legacy / props-added）的**仅有的差别就是 graph_triples.props 列**，
 * P7 混杂变量因此被隔离。
 *
 * @input  dest     — tmp 下的目标路径（已存在则删除重建）
 *         variant  — 'legacy' = 生产断面原样；'props-added' = 补 props 列
 *         nodes    — 合成节点
 *         edges    — 合成边
 * @output Promise<void>
 * @degraded 无
 * @error  路径非 tmp / 建表失败 / SQL 失败 → throw
 */
export async function buildFixture(opts: {
  dest: string;
  variant: SchemaVariant;
  nodes?: NodeSpec[];
  edges?: EdgeSpec[];
  /** 缺省 'prod-snapshot'（本地证据跑）；CI/无生产库环境显式传 'pinned-prod-schema' */
  schemaSource?: SchemaSource;
}): Promise<void> {
  const { dest, variant, nodes = [], edges = [], schemaSource = 'prod-snapshot' } = opts;
  assertTmpPath(dest);
  if (existsSync(dest)) rmSync(dest, { force: true });
  for (const suffix of ['-wal', '-shm']) {
    if (existsSync(dest + suffix)) rmSync(dest + suffix, { force: true });
  }
  if (schemaSource === 'prod-snapshot') {
    await snapshotProdDb(dest);
  } else {
    const seed = new Database(dest);
    try {
      seed.exec(PINNED_PROD_NODES_DDL);
      seed.exec(PINNED_PROD_TRIPLES_DDL);
    } finally {
      seed.close();
    }
  }

  const db = new Database(dest);
  try {
    if (variant === 'props-added') {
      const cols = (db.pragma('table_info(graph_triples)') as Array<{ name: string }>).map((c) => c.name);
      if (!cols.includes('props')) {
        db.exec("ALTER TABLE graph_triples ADD COLUMN props TEXT NOT NULL DEFAULT '{}'");
      }
    }
    if (variant === 'canonical') {
      // 按仓库 SCHEMA_SQL 的 graph_triples 形状整表重建（id TEXT PRIMARY KEY + props + 默认值）
      db.exec('DROP TABLE IF EXISTS graph_triples');
      db.exec(`CREATE TABLE graph_triples (
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
      )`);
    }

    const insertNode = db.prepare(
      'INSERT OR REPLACE INTO graph_nodes (id, type, graph, name, props) VALUES (?, ?, ?, ?, ?)',
    );
    for (const n of nodes) {
      insertNode.run(n.id, n.type, n.graph, n.name ?? n.id, JSON.stringify(n.props ?? {}));
    }

    const nodeTypes = new Map(nodes.map((n) => [n.id, n.type]));
    if (variant === 'legacy') {
      const insertEdge = db.prepare(
        `INSERT INTO graph_triples
           (subject_type, subject_id, predicate, object_type, object_id, graph, weight, props_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, '{}')`,
      );
      for (const e of edges) {
        insertEdge.run(
          nodeTypes.get(e.subjectId) ?? e.subjectType,
          e.subjectId,
          e.predicate,
          nodeTypes.get(e.objectId) ?? e.objectType,
          e.objectId,
          e.graph,
          1.0,
        );
      }
    } else if (variant === 'canonical') {
      const insertEdge = db.prepare(
        `INSERT INTO graph_triples
           (id, subject_type, subject_id, predicate, object_type, object_id, graph, weight, props)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}')`,
      );
      edges.forEach((e, i) => {
        insertEdge.run(
          `edge-canon-${i + 1}`,
          nodeTypes.get(e.subjectId) ?? e.subjectType,
          e.subjectId,
          e.predicate,
          nodeTypes.get(e.objectId) ?? e.objectType,
          e.objectId,
          e.graph,
          1.0,
        );
      });
    } else {
      const insertEdge = db.prepare(
        `INSERT INTO graph_triples
           (subject_type, subject_id, predicate, object_type, object_id, graph, weight, props, props_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, '{}', '{}')`,
      );
      for (const e of edges) {
        insertEdge.run(
          nodeTypes.get(e.subjectId) ?? e.subjectType,
          e.subjectId,
          e.predicate,
          nodeTypes.get(e.objectId) ?? e.objectType,
          e.objectId,
          e.graph,
          1.0,
        );
      }
    }
  } finally {
    db.close();
  }
}

/** 直连 SQL 读边计数（绕过 GraphStore，用于确认"数据确实存在"） */
export function rawEdgeCount(dbPath: string, graph: string): number {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const row = db
      .prepare('SELECT COUNT(*) AS n FROM graph_triples WHERE graph = ? AND valid_to IS NULL')
      .get(graph) as { n: number };
    return row.n;
  } finally {
    db.close();
  }
}

// ═══ 哨兵探针 ═══

export type EntryPointMode = 'manifest' | 'aggregate';
export type ExportKeyMode = 'manifest' | 'default';
export type ArgMode = 'loader4' | 'loader3' | 'cto2';
export type ThresholdsMode = 'manifest' | 'none';

export interface ProbeOptions {
  dbPath: string;
  teamId?: string;
  entryPointMode?: EntryPointMode;
  exportKeyMode?: ExportKeyMode;
  argMode?: ArgMode;
  thresholdsMode?: ThresholdsMode;
  /** 用直连 SQL 的边计数做"数据确实存在"的对照（可选） */
  rawEdgeProbe?: boolean;
  /** 只跑指定哨兵（测试加速用；缺省 = 全部） */
  only?: string[];
}

export interface ProbeRow {
  name: string;
  entryPoint: string;
  exportKey: string;
  /** 'file-ok' | 'file-missing' */
  entryStatus: 'file-ok' | 'file-missing';
  /** 'ok' | 'no-check-method' | 'import-threw' | 'check-threw' */
  outcome: 'ok' | 'no-check-method' | 'import-threw' | 'check-threw';
  rawIsArray: boolean | null;
  rawKind: string;
  /** 列 A：`Array.isArray(raw)` 为真时的 raw.length（否则 null） */
  arrayFindings: number | null;
  /** 列 B：loader 解包后 `findings.length`（判定列） */
  unpackedFindings: number | null;
  /** loader 解包口径下的 degraded 标记 */
  unpackedDegraded: boolean | null;
  tally: StoreTally;
  /** 该哨兵执行期间 SQL 层 prepare 调用数 */
  sqlPrepareCalls: number;
  /** 该哨兵执行期间 SQL 层 prepare 失败数（>0 = 有查询在 prepare 期就死了） */
  sqlPrepareFailed: number;
  /** SQL 层失败样本 */
  sqlFailedStatements: Array<{ sql: string; error: string }>;
  error: string | null;
}

function kindOf(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

interface SentinelLike {
  check: (...args: unknown[]) => unknown;
  manifest?: unknown;
}

function asSentinel(v: unknown): SentinelLike | null {
  if (typeof v !== 'object' || v === null) return null;
  const candidate = v as { check?: unknown };
  if (typeof candidate.check !== 'function') return null;
  return v as SentinelLike;
}

/**
 * 复刻 loader 的单哨兵调用路径并逐口径测量。
 *
 * 与 `registerLoadedSentinels()` 的对应关系（src/sentinel/sentinel-loader.ts:181-300）：
 *   - entryPath   = join(dir, manifest.entryPoint || './aggregate.ts')   ← 'manifest' 模式逐字一致
 *   - sentinelObj = mod[manifest.exportKey || 'default']                ← 'manifest' 模式逐字一致
 *   - 'manifest' in sentinelObj → 挂 manifest（P0-1 修复语义）           ← 一致
 *   - store/teamId/traversal/thresholds 四参注入                          ← 'loader4' 模式一致
 *   - 解包口径 = Array.isArray(raw) ? raw : (raw?.findings ?? [])         ← 逐字一致
 * 差异（必须登记）：本探针不经过 registry / runner，因此不含
 *   `resolveThresholds` 之后的 memStore 覆写（本卡测试不得触碰生产库，改用 deps 注入缝）。
 *
 * @input  opts — 见 ProbeOptions
 * @output ProbeRow[]（行数 = loadSentinels().sentinels.length，**动态取数不写死**；顺序同 loadSentinels）
 * @degraded 单哨兵 import/check 失败 → 该行 outcome 标注，其余行不受影响
 * @error  夹具 DB 打不开 / 目录不可读 → throw
 */
export async function probeSentinels(opts: ProbeOptions): Promise<ProbeRow[]> {
  const {
    dbPath,
    teamId = 'probe-team',
    entryPointMode = 'manifest',
    exportKeyMode = 'manifest',
    argMode = 'loader4',
    thresholdsMode = 'manifest',
  } = opts;

  assertTmpPath(dbPath);
  const rawDb = new Database(dbPath, { readonly: false, fileMustExist: true });
  const { db: instrumentedDb, sql: sqlTally } = instrumentDatabase(rawDb);
  const rows: ProbeRow[] = [];
  const { sentinels } = loadSentinels();
  const targets = opts.only ? sentinels.filter((x) => opts.only?.includes(x.manifest.name)) : sentinels;

  try {
    for (const { manifest, dir } of targets) {
      const entryRel = entryPointMode === 'manifest' ? manifest.entryPoint || './aggregate.ts' : './aggregate.ts';
      const entryPath = join(dir, entryRel);
      const exportKey = exportKeyMode === 'manifest' ? manifest.exportKey || 'default' : 'default';
      const entryStatus: ProbeRow['entryStatus'] = existsSync(entryPath) ? 'file-ok' : 'file-missing';

      const row: ProbeRow = {
        name: manifest.name,
        entryPoint: entryRel,
        exportKey,
        entryStatus,
        outcome: 'import-threw',
        rawIsArray: null,
        rawKind: 'undefined',
        arrayFindings: null,
        unpackedFindings: null,
        unpackedDegraded: null,
        tally: emptyTally(),
        sqlPrepareCalls: 0,
        sqlPrepareFailed: 0,
        sqlFailedStatements: [],
        error: null,
      };

      if (entryStatus === 'file-missing') {
        row.outcome = 'import-threw';
        row.error = `entryPoint 不存在: ${entryPath}`;
        rows.push(row);
        continue;
      }

      try {
        const mod = (await import(pathToFileURL(entryPath).href)) as Record<string, unknown>;
        const sentinel = asSentinel(mod[exportKey]);
        if (sentinel === null) {
          row.outcome = 'no-check-method';
          row.error = `exportKey=${exportKey} 无 check() 方法（模块导出键: ${Object.keys(mod).join(',')}）`;
          rows.push(row);
          continue;
        }

        if ('manifest' in sentinel) {
          sentinel.manifest = manifest;
        }

        const store = new SqliteGraphStore(instrumentedDb);
        const { store: instrumented, tally: t } = instrumentStore(store);
        row.tally = t;
        const traversal = createGraphTraversal(instrumented);

        let thresholds: Record<string, SentinelThresholdPair> | undefined;
        if (thresholdsMode === 'manifest' && argMode === 'loader4') {
          const resolved = await resolveThresholds(manifest.name, teamId, {
            memoryStore: { recall: () => null },
          });
          thresholds = resolved.thresholds;
        }

        // SQL 层基线：排除 SqliteGraphStore 构造期（WAL/initSchema/reconcileSchema）的噪声
        const sqlBase = sqlTally.prepareCalls;
        const sqlBaseFailed = sqlTally.prepareFailed;

        const args: unknown[] =
          argMode === 'loader4'
            ? [instrumented, teamId, traversal, thresholds]
            : argMode === 'loader3'
              ? [instrumented, teamId, traversal]
              : [instrumented, teamId];

        const raw: unknown = await sentinel.check(...args);

        row.sqlPrepareCalls = sqlTally.prepareCalls - sqlBase;
        row.sqlPrepareFailed = sqlTally.prepareFailed - sqlBaseFailed;
        row.sqlFailedStatements = sqlTally.failedStatements.slice(0, 2);

        row.rawIsArray = Array.isArray(raw);
        row.rawKind = kindOf(raw);
        if (Array.isArray(raw)) {
          row.arrayFindings = raw.length;
          row.unpackedFindings = raw.length;
          row.unpackedDegraded = false;
        } else {
          const obj = raw as { findings?: unknown; degraded?: unknown } | null;
          const found = obj?.findings;
          row.unpackedFindings = Array.isArray(found) ? found.length : 0;
          row.unpackedDegraded = obj?.degraded === true;
        }
        row.outcome = 'ok';
      } catch (err: unknown) {
        row.outcome = 'check-threw';
        row.error = err instanceof Error ? err.message : String(err);
      }
      rows.push(row);
    }
  } finally {
    rawDb.close();
  }

  if (opts.rawEdgeProbe) {
    const n = rawEdgeCount(dbPath, teamId);
    for (const r of rows) r.error = r.error ?? null;
    void n;
  }
  return rows;
}

/** 汇总口径（只用原始实测值，不做"通过"判定） */
export interface ProbeSummary {
  total: number;
  arrays: number;
  nonArray: number;
  threw: number;
  missingEntry: number;
  noCheckMethod: number;
  /** 列 A：仅统计 raw 为数组者中的 finding 数 = 0 */
  zeroFindingsArrayScope: number;
  /** 列 B：统计全部哨兵 loader 解包后 findings.length = 0（判定列） */
  zeroFindingsUnpackedScope: number;
  /**
   * 列 C：「产出 finding = 0」的哨兵数——**含缺件/抛错/非数组且无 findings 者**。
   * 存在理由：CTO 派单件 §一 同时给出「返回数组=42 / 异常=3 / 零 finding=23」三个轴，
   * 三轴口径不自洽（"数组"+"异常" 与"零 finding"轴不同源）。本列用于可证伪地对齐 CTO 的 23。
   */
  zeroFindingsAnyOutcome: number;
  /** 运行时 store 调用总数 = 0 的哨兵 */
  zeroStoreCalls: string[];
  /** 运行时 store 有调用但全部失败的哨兵（P7 受害面） */
  storeCallsAllFailed: string[];
  /** 运行时报错的哨兵 */
  threwNames: string[];
  /** 边读（queryEdges）成功 / 失败的哨兵数 */
  queryEdgesOk: number;
  queryEdgesFailed: number;
  queryEdgesAttempted: number;
  /** queryEdges 总调用次数（"49" 这类分母的来源，必须实测不许手写） */
  queryEdgesCalls: number;
  /** queryEdges 返回值里**真的读到的边行数**累加（补列前应恒为 0） */
  queryEdgesRowsReturned: number;
  /** SQL 层 prepare 总调用 / 总失败（方法层看不见的那一层） */
  sqlPrepareCalls: number;
  sqlPrepareFailed: number;
  /** SQL 层出现 prepare 失败的哨兵数与名单（P7 受害面，方法层不可见） */
  sentinelsWithSqlFailure: string[];
  /** 非数组返回的哨兵（原始形态） */
  nonArrayNames: string[];
  zeroFindingsArrayNames: string[];
  zeroFindingsUnpackedNames: string[];
}

export function summarize(rows: ProbeRow[]): ProbeSummary {
  const s: ProbeSummary = {
    total: rows.length,
    arrays: 0,
    nonArray: 0,
    threw: 0,
    missingEntry: 0,
    noCheckMethod: 0,
    zeroFindingsArrayScope: 0,
    zeroFindingsUnpackedScope: 0,
    zeroFindingsAnyOutcome: 0,
    zeroStoreCalls: [],
    storeCallsAllFailed: [],
    threwNames: [],
    queryEdgesOk: 0,
    queryEdgesFailed: 0,
    queryEdgesAttempted: 0,
    queryEdgesCalls: 0,
    queryEdgesRowsReturned: 0,
    sqlPrepareCalls: 0,
    sqlPrepareFailed: 0,
    sentinelsWithSqlFailure: [],
    nonArrayNames: [],
    zeroFindingsArrayNames: [],
    zeroFindingsUnpackedNames: [],
  };
  for (const r of rows) {
    if (r.entryStatus === 'file-missing') s.missingEntry += 1;
    if (r.outcome === 'no-check-method') s.noCheckMethod += 1;
    if (r.outcome === 'import-threw' || r.outcome === 'check-threw') {
      s.threw += 1;
      s.threwNames.push(r.name);
    }
    if (r.rawIsArray === true) {
      s.arrays += 1;
      if ((r.arrayFindings ?? 0) === 0) {
        s.zeroFindingsArrayScope += 1;
        s.zeroFindingsArrayNames.push(r.name);
      }
    } else if (r.outcome === 'ok') {
      s.nonArray += 1;
      s.nonArrayNames.push(r.name);
    }
    if (r.outcome === 'ok' && (r.unpackedFindings ?? 0) === 0) {
      s.zeroFindingsUnpackedScope += 1;
      s.zeroFindingsUnpackedNames.push(r.name);
    }
    // 列 C：无论 outcome 为何，只要"没产出任何 finding"就计入（缺件/抛错视作产出 0）
    const produced = r.outcome === 'ok' ? (r.unpackedFindings ?? 0) : 0;
    if (produced === 0) s.zeroFindingsAnyOutcome += 1;
    if (r.outcome === 'ok' && r.tally.total === 0) s.zeroStoreCalls.push(r.name);
    if (r.outcome === 'ok' && r.tally.total > 0 && r.tally.ok === 0) s.storeCallsAllFailed.push(r.name);
    const qe = r.tally.byMethod.queryEdges;
    if (qe) {
      s.queryEdgesAttempted += 1;
      s.queryEdgesCalls += qe.calls;
      s.queryEdgesRowsReturned += qe.rowsReturned;
      if (qe.ok > 0) s.queryEdgesOk += 1;
      if (qe.failed > 0 && qe.ok === 0) s.queryEdgesFailed += 1;
    }
    s.sqlPrepareCalls += r.sqlPrepareCalls;
    s.sqlPrepareFailed += r.sqlPrepareFailed;
    if (r.sqlPrepareFailed > 0) s.sentinelsWithSqlFailure.push(r.name);
  }
  s.zeroStoreCalls.sort();
  s.storeCallsAllFailed.sort();
  s.sentinelsWithSqlFailure.sort();
  return s;
}

/** 快照文件大小（证据用，避免"声称存在"） */
export function fileInfo(p: string): { path: string; bytes: number } {
  return { path: p, bytes: statSync(p).size };
}


// ═══ D966 合成图夹具（合成数据契约，供 run-p7-control.ts 与单测共用） ═══

/**
 * 传给 aggregate.check 的第 2 参（哨兵用它做节点过滤 props.teamId）。
 *
 * 依据（读代码，不猜）：哨兵普遍以 `queryNodes('Financial', { teamId })` 调用；
 * `SqliteGraphStore.queryNodes` 第三参缺省取 `graph || "default"`（sqlite-graph-store.ts:195），
 * filters 走 `json_extract(props,'$.teamId') = ?`（同文件 202-207）。
 * ⇒ 夹具必须在 graph='default' 下、且 props 内含 teamId=TEAM_ID，才会被哨兵真正读到。
 * （D966 首轮夹具把数据放在 graph='probe-team' → 节点/边根本读不到、零 finding 数字全表相同；
 *   已修正并留证：不加 teamId 根节点时 traverse 恒空，也会导致同样假象。）
 */
export const TEAM_ID = 'probe-team';

/** 夹具数据的 graph 归属（哨兵不传第三参时 store 的默认值） */
export const FIXTURE_GRAPH = 'default';

/** 哨兵实际查询到的节点类型（`grep -rhoE "queryNodes\(\s*'[A-Za-z_]+'"` 实测：Financial/Event/Person/Tool/Client/Process/Team/Document/Agent） */
export const FIXTURE_NODE_TYPES = [
  'Financial',
  'Event',
  'Person',
  'Tool',
  'Client',
  'Process',
  'Team',
  'Document',
  'Agent',
] as const;

/**
 * 合成节点集：含一个 **id == teamId 的根节点**。
 *
 * 为什么必须有根节点：哨兵普遍以 `traversal.traverse([teamId], ['DEPLOYS'])` 起遍历
 * （src/l4/graph-traversal.ts:62-115 BFS，起点即 startNodeIds），随后多半写
 * `if (!r.nodes[0]) return []`。没有 id==teamId 的起点节点时 traverse 恒空
 * ⇒ 这些哨兵**静默返回零 finding**（与"图里没数据"不可区分）。
 */
export function synthNodes(graph: string = FIXTURE_GRAPH, teamId: string = TEAM_ID): NodeSpec[] {
  const nodes: NodeSpec[] = [
    {
      id: teamId,
      type: 'Tool',
      graph,
      name: teamId,
      props: { name: teamId, label: teamId, teamId, amount: 500, value: 50, count: 5 },
    },
  ];
  for (const t of FIXTURE_NODE_TYPES) {
    for (let i = 1; i <= 2; i += 1) {
      nodes.push({
        id: `${t.toLowerCase()}-${i}`,
        type: t,
        graph,
        name: `${t}-${i}`,
        props: { name: `${t}-${i}`, label: `${t}-${i}`, teamId, amount: 100 * i, value: 10 * i, count: i },
      });
    }
  }
  return nodes;
}

/** 3 边夹具：全 DEPLOYS，起点边 subject_id == teamId（哨兵引用最多的边类型，实测 33 处） */
export function threeEdges(graph: string = FIXTURE_GRAPH, teamId: string = TEAM_ID): EdgeSpec[] {
  return [
    { subjectType: 'Tool', subjectId: teamId, predicate: 'DEPLOYS', objectType: 'Process', objectId: 'process-1', graph },
    { subjectType: 'Tool', subjectId: teamId, predicate: 'DEPLOYS', objectType: 'Process', objectId: 'process-2', graph },
    { subjectType: 'Tool', subjectId: teamId, predicate: 'DEPLOYS', objectType: 'Tool', objectId: 'tool-1', graph },
  ];
}

/** 4 边夹具：3×DEPLOYS（含起点边）+ 1×OWNS */
export function fourEdges(graph: string = FIXTURE_GRAPH, teamId: string = TEAM_ID): EdgeSpec[] {
  return [
    ...threeEdges(graph, teamId),
    {
      subjectType: 'Person',
      subjectId: 'person-1',
      predicate: 'OWNS',
      objectType: 'Financial',
      objectId: 'financial-1',
      graph,
    },
  ];
}
