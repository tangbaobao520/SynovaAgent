/**
 * tests/sentinel/audit/run-p7-control.ts — D966 P7 混杂变量对照重跑
 *
 * P7 判定：生产库 `graph_triples` **整表结构漂移**（与仓库 canonical `SCHEMA_SQL`
 * 不是同一张表），而非"只缺一列"：
 *   - `id`        : 生产 INTEGER PRIMARY KEY AUTOINCREMENT ／ 仓库 TEXT PRIMARY KEY
 *   - `props`     : 生产缺（只有 props_json）／ 仓库 TEXT NOT NULL DEFAULT '{}'
 *   - `graph`     : 生产 TEXT NOT NULL（无默认）／ 仓库 TEXT NOT NULL DEFAULT 'default'
 *   - 生产额外列  : props_json / confidence / source
 *
 * 三态对照（每态都实测，不引用任何声称）：
 *   legacy        = 生产断面原样
 *   props-added   = 仅 `ALTER TABLE graph_triples ADD COLUMN props ...`（把"补一列就够了"这一
 *                   假设当假设去证伪）
 *   canonical     = 按仓库 SCHEMA_SQL 整表重建（DROP + CREATE，id TEXT PRIMARY KEY + props + 默认值）
 *
 * 图夹具三档：空库 / 3 边 / 4 边（含 DEPLOYS 起点边）。
 *
 * 用法: npx tsx tests/sentinel/audit/run-p7-control.ts
 *
 * 契约（铁律 47）:
 *   @input  — 无（argv 无参）
 *   @output — stdout：只读断面 + 读/写路径三态原始输出 + 哨兵口径 B/C/D/E 汇总表
 *   @degraded — 单哨兵失败计入表格，不中断
 *   @error  — 夹具不可建 / 生产库不可读 → 非 0 退出
 */

import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync } from 'node:fs';
import Database from 'better-sqlite3';
import { SqliteGraphStore } from '../../../src/adapters/sqlite-graph-store';
import {
  buildFixture,
  inspectProdSchema,
  probeSentinels,
  rawEdgeCount,
  summarize,
  PROD_DB,
  type SchemaVariant,
} from './probe-harness';

const SCRATCH = join(tmpdir(), 'd966-p7');

function out(line = ''): void {
  process.stdout.write(`${line}\n`);
}

function head(title: string): void {
  out(`\n${'═'.repeat(78)}`);
  out(title);
  out('═'.repeat(78));
}

function pad(s: string, n: number): string {
  return s.length >= n ? `${s} ` : s + ' '.repeat(n - s.length);
}

import { TEAM_ID, FIXTURE_GRAPH, synthNodes, threeEdges, fourEdges } from './probe-harness';



// ═══ 只读断面 ═══

function sectionReadonlySurface(): void {
  head('① 生产库只读断面（独立复现，不采信任何声称）');
  const info = inspectProdSchema();
  out(`生产库                    : ${PROD_DB}`);
  out(`graph_nodes   列          : ${info.nodesColumnNames.join(', ')}`);
  out(`graph_triples 列          : ${info.triplesColumnNames.join(', ')}`);
  out(`graph_nodes   行数        : ${info.nodeCount}`);
  out(`graph_triples 行数        : ${info.edgeCount}`);
  out(`graph_nodes   有 props 列 : ${info.nodesColumnNames.includes('props')}`);
  out(`graph_triples 有 props 列 : ${info.triplesColumnNames.includes('props')}`);
  out(`graph_triples DDL        : ${info.triplesDdl}`);
  out(`graph_nodes   DDL        : ${info.nodesDdl}`);
}

// ═══ 边读路径 ═══

function readPathControl(variant: SchemaVariant, dest: string): void {
  const store = new SqliteGraphStore(new Database(dest, { fileMustExist: true }));
  let status: string;
  let rows = -1;
  try {
    const edges = store.queryEdges(undefined, undefined, undefined, FIXTURE_GRAPH);
    rows = edges.length;
    status = '方法层：正常返回（无异常）';
  } catch (err: unknown) {
    status = `方法层：抛错 ${err instanceof Error ? err.message : String(err)}`;
  }
  const raw = rawEdgeCount(dest, FIXTURE_GRAPH);
  out(`  [${pad(variant, 12)}] 直连 SQL 边行数（数据确实存在？）= ${raw}`);
  out(`  [${pad(variant, 12)}] queryEdges 返回行数 = ${rows}`);
  out(`  [${pad(variant, 12)}] ${status}`);
}

// ═══ 边写路径 ═══

function writePathControl(variant: SchemaVariant, dest: string): void {
  const store = new SqliteGraphStore(new Database(dest, { fileMustExist: true }));
  let outcome: string;
  try {
    const from = store.createNode('Tool', { name: 'w-tool', teamId: TEAM_ID }, FIXTURE_GRAPH);
    const to = store.createNode('Process', { name: 'w-process', teamId: TEAM_ID }, FIXTURE_GRAPH);
    const edgeId = store.createEdge('DEPLOYS', from, to, 1.0, { src: 'd966-control', teamId: TEAM_ID }, FIXTURE_GRAPH);
    const readBack = store.queryEdges(undefined, undefined, undefined, FIXTURE_GRAPH);
    outcome = `成功 ｜ 写入 edgeId=${edgeId} ｜ 读回 ${readBack.length} 行`;
  } catch (err: unknown) {
    outcome = `失败 ｜ ${err instanceof Error ? err.message : String(err)}`;
  }
  out(`  [${pad(variant, 12)}] createNode → createEdge → queryEdges : ${outcome}`);
}

async function main(): Promise<void> {
  mkdirSync(SCRATCH, { recursive: true });
  out('D966 P7 对照重跑 ｜ graph_triples 三态 × 图夹具三档');
  sectionReadonlySurface();

  // ── 空库三态 ──
  head('② 读路径/写路径 三态对照（空库，图数据 0）');
  const emptyLegacy = join(SCRATCH, 'empty-legacy.db');
  const emptyProps = join(SCRATCH, 'empty-props.db');
  const emptyCanon = join(SCRATCH, 'empty-canonical.db');
  await buildFixture({ dest: emptyLegacy, variant: 'legacy' });
  await buildFixture({ dest: emptyProps, variant: 'props-added' });
  await buildFixture({ dest: emptyCanon, variant: 'canonical' });

  out('读路径：');
  readPathControl('legacy', emptyLegacy);
  readPathControl('props-added', emptyProps);
  readPathControl('canonical', emptyCanon);
  out('写路径：');
  writePathControl('legacy', emptyLegacy);
  writePathControl('props-added', emptyProps);
  writePathControl('canonical', emptyCanon);

  // ── 3 边 / 4 边 ──
  head('③ 读路径对照（3 边夹具：数据确实存在，读不到 = 读路径坏，不是"没数据"）');
  const e3Legacy = join(SCRATCH, 'e3-legacy.db');
  const e3Props = join(SCRATCH, 'e3-props.db');
  const e3Canon = join(SCRATCH, 'e3-canonical.db');
  const nodes = synthNodes(FIXTURE_GRAPH);
  const edges3 = threeEdges(FIXTURE_GRAPH);
  const edges4 = fourEdges(FIXTURE_GRAPH);
  await buildFixture({ dest: e3Legacy, variant: 'legacy', nodes, edges: edges3 });
  await buildFixture({ dest: e3Props, variant: 'props-added', nodes, edges: edges3 });
  await buildFixture({ dest: e3Canon, variant: 'canonical', nodes, edges: edges3 });
  readPathControl('legacy', e3Legacy);
  readPathControl('props-added', e3Props);
  readPathControl('canonical', e3Canon);

  head('④ 读路径对照（4 边夹具：3×DEPLOYS + 1×OWNS）');
  const e4Legacy = join(SCRATCH, 'e4-legacy.db');
  const e4Props = join(SCRATCH, 'e4-props.db');
  const e4Canon = join(SCRATCH, 'e4-canonical.db');
  await buildFixture({ dest: e4Legacy, variant: 'legacy', nodes, edges: edges4 });
  await buildFixture({ dest: e4Props, variant: 'props-added', nodes, edges: edges4 });
  await buildFixture({ dest: e4Canon, variant: 'canonical', nodes, edges: edges4 });
  readPathControl('legacy', e4Legacy);
  readPathControl('props-added', e4Props);
  readPathControl('canonical', e4Canon);

  // ── 哨兵口径矩阵 ──
  head('⑤ 哨兵口径矩阵（同一节点集，仅改 graph_triples 断面 ⇒ 差异只能归因于 P7）');
  const runs: Array<{ label: string; dbPath: string }> = [
    { label: 'A  空库 + legacy      ', dbPath: emptyLegacy },
    { label: 'A2 空库 + props-added ', dbPath: emptyProps },
    { label: 'B  3 边 + legacy      ', dbPath: e3Legacy },
    { label: 'C  4 边 + legacy      ', dbPath: e4Legacy },
    { label: 'D  3 边 + props-added ', dbPath: e3Props },
    { label: 'E  4 边 + props-added ', dbPath: e4Props },
    { label: 'F  3 边 + canonical   ', dbPath: e3Canon },
    { label: 'G  4 边 + canonical   ', dbPath: e4Canon },
  ];
  /** D965 裁撤的 2 个硬编码桩（43 件断面的模拟依据） */
  const EXTINCT_AFTER_D965 = ['sentinel-forecast-accuracy', 'sentinel-pricing-strategy'];
  out(
    `${pad('口径', 24)}${pad('数组', 6)}${pad('非数组', 7)}${pad('抛错', 6)}${pad('零A', 6)}${pad('零B', 6)}${pad('零C', 6)}${pad(
      '零R',
      5,
    )}${pad('零Q', 5)}${pad('零Q2', 6)}${pad('零Q(43件)', 10)}${pad('qE调用', 8)}${pad('qE读到的边', 12)}${pad(
      'SQL失败',
      8,
    )}${pad('SQL失败哨兵', 12)}`,
  );
  for (const r of runs) {
    const rows = await probeSentinels({ dbPath: r.dbPath, teamId: TEAM_ID, rawEdgeProbe: true });
    const s = summarize(rows);
    const q43 = s.zeroQueryNodesCalls.filter((n) => !EXTINCT_AFTER_D965.includes(n)).length;
    const q43denom = rows.length - EXTINCT_AFTER_D965.length;
    out(
      `${pad(r.label, 24)}${pad(String(s.arrays), 6)}${pad(String(s.nonArray), 7)}${pad(String(s.threw), 6)}${pad(
        String(s.zeroFindingsArrayScope),
        6,
      )}${pad(String(s.zeroFindingsUnpackedScope), 6)}${pad(String(s.zeroFindingsAnyOutcome), 6)}${pad(
        String(s.zeroStoreCalls.length),
        5,
      )}${pad(String(s.zeroQueryNodesCalls.length), 5)}${pad(String(s.zeroGraphNodesSql.length), 6)}${pad(
        `${q43}/${q43denom}`,
        10,
      )}${pad(String(s.queryEdgesCalls), 8)}${pad(String(s.queryEdgesRowsReturned), 12)}${pad(
        String(s.sqlPrepareFailed),
        8,
      )}${pad(String(s.sentinelsWithSqlFailure.length), 12)}`,
    );
  }
  out('');
  out('列义: 零A=数组口径零 finding ｜ 零B=loader 解包口径零 finding（判定列）｜ 零C=产出为零（含缺件）');
  out('      零R=总 store 调用=0（「空转/零调用」判定列 = 2）｜ 零Q=方法层 queryNodes 调用=0 ｜ 零Q2=SQL 层无 FROM graph_nodes');
  out('      零Q(43件) = D965 裁撤 2 桩后的断面模拟（分子/分母，分母 = 动态取数 − 2）');
  out('      ⚠️ 零Q（20）与 零R（2）是两个不同口径，不可互相证伪：零Q 中 18 件走 traverse→queryEdges/getNode，仍触达图');
  out('      qE读到的边 = queryEdges 返回值中真实边行数累加（legacy 应恒 0）');
}

void main();
