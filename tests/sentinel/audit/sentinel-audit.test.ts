/**
 * tests/sentinel/audit/sentinel-audit.test.ts — D966 判别性夹具（含金丝雀）
 *
 * 目的：把 D966 的两条核心结论固化为**可证伪的运行时断言**（禁 grep 型静态判据）：
 *   C1 边读路径：同一批边数据（直连 SQL 证明存在），在 legacy 断面读到 0 行、在 canonical
 *      断面读到 3 行 ⇒ 「读不到」不是「没数据」，是 schema 漂移。
 *   C2 边写路径：legacy → `no column named props`；仅补列 → `datatype mismatch`；
 *      整表重建 → 成功 ⇒ **补列 ≠ 修好**（这就是 P7 判定加严的判别性证据）。
 *   C3 哨兵级：同一节点集 + 同一边集，仅换 graph_triples 断面 ⇒ 哨兵产出改变
 *      ⇒ P7 是**混杂变量**，不是背景噪声。
 *
 * 金丝雀（canary）设计：T6 故意把边塞进**读不到的 graph**（canonical 断面但边在错误 graph），
 * 断言 C3 的判别量回到 legacy 水平。若 T6 不变红，说明 T5 的差异并非来自"边真的可读"，
 * 而是夹具/schema 的别的东西 —— 那时 T5 的结论不成立。T6 因此是 T5 的**证伪开关**。
 *
 * 判据方言无关：全部断言只用运行时数值（返回行数 / findings 条数 / 抛错消息子串），
 * 不使用任何"源码里出现某关键字"的静态判据。
 *
 * 契约（铁律 47）:
 *   @input  — 无（自带 fixture 构造；所有落盘路径均在 os.tmpdir()/d966-test 下）
 *   @output — vitest 断言结果（≥3 个 expect，覆盖正常/降级/边界三路径）
 *   @degraded — 不适用（测试自身失败即红，不降级）
 *   @error  — 夹具不可建 → 测试失败（fail-closed，绝不 skip 成绿）
 */

import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync } from 'node:fs';
import { describe, it, expect, beforeAll } from 'vitest';
import Database from 'better-sqlite3';
import { SqliteGraphStore } from '../../../src/adapters/sqlite-graph-store';
import {
  buildFixture,
  probeSentinels,
  rawEdgeCount,
  synthNodes,
  threeEdges,
  TEAM_ID,
  FIXTURE_GRAPH,
  PINNED_PROD_NODES_DDL,
  PINNED_PROD_TRIPLES_DDL,
} from './probe-harness';

/**
 * CI 必须自洽：`data/synova.db` 被 `.gitignore:3 (data/)` 排除、CI checkout 里没有生产库，
 * 因此本单测**显式**使用 `pinned-prod-schema`（逐字抄录的生产 DDL），不依赖数据文件。
 * 生产库的真实断面由 `run-p7-control.ts` 在本地以只读方式另行核验（报告 §四）。
 */
const SCHEMA_SOURCE = 'pinned-prod-schema' as const;

const SCRATCH = join(tmpdir(), 'd966-test');

const D = {
  legacy: join(SCRATCH, 'legacy.db'),
  propsAdded: join(SCRATCH, 'props-added.db'),
  canonical: join(SCRATCH, 'canonical.db'),
  canonicalWrongGraph: join(SCRATCH, 'canonical-wrong-graph.db'),
  empty: join(SCRATCH, 'empty.db'),
};

/** 判别用哨兵：legacy 断面 0 条 finding，canonical 断面 1 条（D966 实测 0 → 1） */
const FLIP_SENTINEL = 'ai-ecosystem-fit';

function openStore(path: string): SqliteGraphStore {
  return new SqliteGraphStore(new Database(path, { fileMustExist: true }));
}

beforeAll(async () => {
  mkdirSync(SCRATCH, { recursive: true });
  const nodes = synthNodes();
  const edges = threeEdges();
  await buildFixture({ dest: D.legacy, variant: 'legacy', nodes, edges, schemaSource: SCHEMA_SOURCE });
  await buildFixture({ dest: D.propsAdded, variant: 'props-added', nodes, edges, schemaSource: SCHEMA_SOURCE });
  await buildFixture({ dest: D.canonical, variant: 'canonical', nodes, edges, schemaSource: SCHEMA_SOURCE });
  // 金丝雀夹具：canonical 断面（写法正确），但边全塞进一个哨兵读不到的 graph
  await buildFixture({
    dest: D.canonicalWrongGraph,
    variant: 'canonical',
    nodes: synthNodes(),
    edges: threeEdges('graph-that-sentinels-never-query'),
    schemaSource: SCHEMA_SOURCE,
  });
  // 边界夹具：canonical 断面 + 完全空图（无节点无边）
  await buildFixture({ dest: D.empty, variant: 'canonical', schemaSource: SCHEMA_SOURCE });
});

describe('D966 金丝雀：夹具自证（先证明夹具本身没坏）', () => {
  it('T0 canary: pinned 生产 DDL 必须保持"漂移态"特征 —— 若被误改成 canonical，本套断言全部无意义', () => {
    // 漂移标记 1：id 是 INTEGER PRIMARY KEY AUTOINCREMENT（写 TEXT id 必 datatype mismatch）
    expect(PINNED_PROD_TRIPLES_DDL).toContain('INTEGER PRIMARY KEY AUTOINCREMENT');
    // 漂移标记 2：graph_triples 无 props 列（只有 props_json）
    expect(PINNED_PROD_TRIPLES_DDL).toContain('props_json');
    expect(/\bprops\s+TEXT/.test(PINNED_PROD_TRIPLES_DDL)).toBe(false);
    // 对照：graph_nodes 有 props（这正是 001 迁移只覆盖节点的原因）
    expect(/\bprops\s+TEXT/.test(PINNED_PROD_NODES_DDL)).toBe(true);
  });

  it('T1 canary: 三个夹具的边数据都真实落库（直连 SQL 计数 = 3）', () => {
    // 若夹具构造静默失败，后面所有"读到 0 行"的结论都无意义 → 先钉死数据存在性
    expect(rawEdgeCount(D.legacy, FIXTURE_GRAPH)).toBe(3);
    expect(rawEdgeCount(D.canonical, FIXTURE_GRAPH)).toBe(3);
    // 金丝雀夹具的边不在哨兵图的 graph 里，但确实存在于它自己的 graph
    expect(rawEdgeCount(D.canonicalWrongGraph, FIXTURE_GRAPH)).toBe(0);
    expect(rawEdgeCount(D.canonicalWrongGraph, 'graph-that-sentinels-never-query')).toBe(3);
  });
});

describe('C1 边读路径：数据存在 ≠ 读得到（P7 读侧）', () => {
  it('T2 legacy 断面：3 条边存在，但 queryEdges 读到 0 行，且**不抛错**（静默 fail-open）', () => {
    const store = openStore(D.legacy);
    let threw = false;
    let rows = -1;
    try {
      rows = store.queryEdges(undefined, undefined, undefined, FIXTURE_GRAPH).length;
    } catch {
      threw = true;
    }
    // 降级路径断言：方法层不抛错（错误被 store 内部 catch 吞掉，只留 log.warn）
    expect(threw).toBe(false);
    // 缺陷断言：边确实存在（T1 已证 3 条），但读出来是 0
    expect(rows).toBe(0);
  });

  it('T3 canonical 断面：同一夹具读到 3 行（改好即绿，反证 T2 不是夹具假象）', () => {
    const store = openStore(D.canonical);
    const rows = store.queryEdges(undefined, undefined, undefined, FIXTURE_GRAPH).length;
    expect(rows).toBe(3);
  });
});

describe('C2 边写路径：补列 ≠ 修好（P7 写侧，判定加严的判别性证据）', () => {
  const attemptEdge = (path: string): { ok: boolean; message: string } => {
    const store = openStore(path);
    try {
      const from = store.createNode('Tool', { name: 'w-tool', teamId: TEAM_ID }, FIXTURE_GRAPH);
      const to = store.createNode('Process', { name: 'w-process', teamId: TEAM_ID }, FIXTURE_GRAPH);
      store.createEdge('DEPLOYS', from, to, 1.0, { teamId: TEAM_ID }, FIXTURE_GRAPH);
      return { ok: true, message: '' };
    } catch (err: unknown) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  };

  it('T4a legacy：写边失败，错误为缺列', () => {
    const r = attemptEdge(D.legacy);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('no column named props');
  });

  it('T4b 仅补 props 列：写边**仍然失败**，错误变成主键类型不匹配（补列 ≠ 修好）', () => {
    const r = attemptEdge(D.propsAdded);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('datatype mismatch');
  });

  it('T4c 整表重建为 canonical：写边成功（这是唯一转绿态，构成判别性三态）', () => {
    const r = attemptEdge(D.canonical);
    expect(r.ok).toBe(true);
    const store = openStore(D.canonical);
    expect(store.queryEdges(undefined, undefined, undefined, FIXTURE_GRAPH).length).toBeGreaterThanOrEqual(3);
  });
});

describe('C3 哨兵级：P7 是混杂变量（同节点同边，仅换断面 ⇒ 产出改变）', () => {
  it('T5 legacy 断面下该哨兵产出 0 条 finding；canonical 断面下产出 ≥1 条', async () => {
    const legacy = await probeSentinels({ dbPath: D.legacy, teamId: TEAM_ID, only: [FLIP_SENTINEL] });
    const canonical = await probeSentinels({ dbPath: D.canonical, teamId: TEAM_ID, only: [FLIP_SENTINEL] });
    expect(legacy).toHaveLength(1);
    expect(canonical).toHaveLength(1);
    expect(legacy[0].unpackedFindings).toBe(0);
    expect(canonical[0].unpackedFindings ?? 0).toBeGreaterThan(0);
  });

  it('T6 canary 证伪开关：canonical 断面但边落在读不到的 graph ⇒ 判别量回到 0', async () => {
    const wrong = await probeSentinels({
      dbPath: D.canonicalWrongGraph,
      teamId: TEAM_ID,
      only: [FLIP_SENTINEL],
    });
    // 若这里不是 0，说明 T5 的差异来自"schema 断面"本身而非"边真的被读到" → T5 结论不成立
    expect(wrong[0].unpackedFindings).toBe(0);
  });

  it('T7 边界：空图（无合成数据）⇒ 产出 0；且 teamId 不匹配 ⇒ 产出 0（两条边界都不许伪绿）', async () => {
    const empty = await probeSentinels({ dbPath: D.empty, teamId: TEAM_ID, only: [FLIP_SENTINEL] });
    expect(empty[0].unpackedFindings).toBe(0);
    expect(rawEdgeCount(D.empty, FIXTURE_GRAPH)).toBe(0);
    // 同一非空夹具、换成不匹配的 teamId ⇒ 属性过滤后无节点 ⇒ 仍为 0
    const mismatch = await probeSentinels({ dbPath: D.canonical, teamId: 'no-such-team', only: [FLIP_SENTINEL] });
    expect(mismatch[0].unpackedFindings).toBe(0);
  });
});
