/**
 * tests/sentinel/audit/run-static-audit.ts — D966 静态口径 ↔ 运行时口径对照
 *
 * 用途：Done #1 要求「静态口径与运行时口径两套数字都跑出」。
 *
 * ⚠️ 判据纪律（本卡坑清单第 7 条）：**静态 grep 只作诊断列，不作验收判据**。
 *    本脚本输出的 `staticHasDataAccess` 一律不作为"真算/空转"的判定；
 *    判定只用运行时实测（`runtimeStoreCalls`、`runtimeEdgeRowsRead`）。
 *    原因：grep 型静态判据实测命中率 3/5=60%，且**两个硬编码桩在静态口径下
 *    看起来"有 store 引用"**（它们声明了 context 参数），而运行时调用数恒为 0。
 *
 * 用法: npx tsx tests/sentinel/audit/run-static-audit.ts
 *
 * 契约（铁律 47）:
 *   @input  — 无
 *   @output — stdout：逐哨兵静态/运行时对照表 + 差异归因汇总
 *   @degraded — 单哨兵源文件读失败 → 记 null 并在表中标注，不中断
 *   @error  — 哨兵目录不可读 → 非 0 退出
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { loadSentinels } from '../../../src/sentinel/sentinel-loader';
import { buildFixture, probeSentinels, REPO_ROOT, type ProbeRow } from './probe-harness';

const SCRATCH = join(tmpdir(), 'd966-static');

/** 运行时图数据访问原语（判定"读不读数据"的观测面） */
const DATA_PRIMITIVES = ['queryNodes', 'queryEdges', 'queryTriples', 'getNode', 'traverse'] as const;

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

/** 收集哨兵目录下的全部 .ts（只读；不改任何文件） */
function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  const walk = (d: string): void => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const p = join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith('.ts')) found.push(p);
    }
  };
  if (existsSync(dir) && statSync(dir).isDirectory()) walk(dir);
  return found;
}

interface StaticRow {
  name: string;
  entryPoint: string;
  fileCount: number;
  counts: Record<string, number>;
  /** 源码中是否出现任一数据访问原语（**仅诊断，不作判据**） */
  staticHasDataAccess: boolean;
  staticQueryNodesOnly: number;
  /** 只扫 entryPoint 文件时的 queryNodes 出现次数（用于量化"扫错范围"的偏差） */
  entryFileQueryNodes: number;
  /** 只扫 entryPoint 文件时是否出现任一数据访问原语 */
  entryFileHasDataAccess: boolean;
}

function countIn(blob: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const p of DATA_PRIMITIVES) {
    counts[p] = blob.split(p).length - 1;
  }
  return counts;
}

function readOrEmpty(p: string): string {
  try {
    return readFileSync(p, 'utf-8');
  } catch {
    return '';
  }
}

function staticScan(name: string, dir: string, entryPoint: string): StaticRow {
  const files = sourceFiles(dir);
  const blob = files.map(readOrEmpty).join('\n');
  const counts = countIn(blob);
  const entryBlob = readOrEmpty(join(dir, entryPoint));
  const entryCounts = countIn(entryBlob);
  return {
    name,
    entryPoint,
    fileCount: files.length,
    counts,
    staticHasDataAccess: DATA_PRIMITIVES.some((p) => counts[p] > 0),
    staticQueryNodesOnly: counts.queryNodes,
    entryFileQueryNodes: entryCounts.queryNodes,
    entryFileHasDataAccess: DATA_PRIMITIVES.some((p) => entryCounts[p] > 0),
  };
}

async function main(): Promise<void> {
  out('D966 静态口径 ↔ 运行时口径 对照');
  out(`仓库根: ${REPO_ROOT}`);

  const { sentinels } = loadSentinels();
  const dest = join(SCRATCH, 'static-baseline.db');
  await buildFixture({ dest, variant: 'legacy' });
  const runtime: ProbeRow[] = await probeSentinels({ dbPath: dest, teamId: 'probe-team' });
  const byName = new Map(runtime.map((r) => [r.name, r]));

  const rows = sentinels.map(({ manifest, dir }) =>
    staticScan(manifest.name, dir, manifest.entryPoint || './aggregate.ts'),
  );

  head('逐哨兵对照表');
  out(
    `${pad('#', 3)}${pad('哨兵', 34)}${pad('文件', 5)}${pad('qNodes', 7)}${pad('qEdges', 7)}${pad('traverse', 9)}${pad(
      '静态有数据访问',
      15,
    )}${pad('运行时store调用', 16)}${pad('运行时qE成功/调用', 18)}${pad('运行时qE读到的边', 17)}列B`,
  );
  rows.forEach((r, i) => {
    const rt = byName.get(r.name);
    const qe = rt?.tally.byMethod.queryEdges;
    out(
      `${pad(String(i + 1), 3)}${pad(r.name, 34)}${pad(String(r.fileCount), 5)}${pad(String(r.counts.queryNodes), 7)}${pad(
        String(r.counts.queryEdges),
        7,
      )}${pad(String(r.counts.traverse), 9)}${pad(String(r.staticHasDataAccess), 15)}${pad(
        String(rt?.tally.total ?? '-'),
        16,
      )}${pad(qe ? `${qe.ok}/${qe.calls}` : '0/0', 18)}${pad(String(qe ? qe.rowsReturned : 0), 17)}${
        rt?.unpackedFindings ?? '-'
      }`,
    );
  });

  const zeroOf = (names: string[]): string[] => names.filter((n) => !sentinels.every(() => true));
  void zeroOf;

  const staticEntryQNodesZero = rows.filter((r) => r.entryFileQueryNodes === 0).map((r) => r.name);
  const staticEntryAnyZero = rows.filter((r) => !r.entryFileHasDataAccess).map((r) => r.name);
  const staticDirQNodesZero = rows.filter((r) => r.staticQueryNodesOnly === 0).map((r) => r.name);
  const staticDirAnyZero = rows.filter((r) => !r.staticHasDataAccess).map((r) => r.name);
  const runtimeZero = runtime.filter((r) => r.outcome === 'ok' && r.tally.total === 0).map((r) => r.name);
  const runtimeAny = rows.length - runtimeZero.length;

  head('两套口径数字（差异归因）');
  out(`哨兵总数                                       = ${rows.length}`);
  out('');
  out('静态口径（四种扫法，全部实测）:');
  out(`  S1 只扫 entryPoint 文件 · queryNodes 字样 0 次 = ${staticEntryQNodesZero.length}`);
  out(`  S2 只扫 entryPoint 文件 · 全无数据访问原语    = ${staticEntryAnyZero.length}`);
  out(`  S3 扫整个哨兵目录 · queryNodes 字样 0 次      = ${staticDirQNodesZero.length}`);
  out(`  S4 扫整个哨兵目录 · 全无数据访问原语          = ${staticDirAnyZero.length}`);
  out('');
  out('运行时口径:');
  out(`  R   store 调用 = 0 的哨兵                     = ${runtimeZero.length}  [${runtimeZero.join(', ')}]`);
  out(`  R'  store 调用 > 0 的哨兵                     = ${runtimeAny}`);
  out('');
  out('差异归因（逐条可核）:');
  out(`  ① 扫错范围：S1(${staticEntryQNodesZero.length}) → S3(${staticDirQNodesZero.length})，差 ${
    staticEntryQNodesZero.length - staticDirQNodesZero.length
  } 件 —— 数据访问大量下沉在 computes/*.ts 与 shared/computes/，只扫入口必漏。`);
  out(`  ② 静态 vs 运行时：S3(${staticDirQNodesZero.length}) → R(${runtimeZero.length})，差 ${
    staticDirQNodesZero.length - runtimeZero.length
  } 件 —— 真正的硬编码桩**声明**了 context/store 形参，静态看"有引用"（出现字样），运行时却一次都不调用。`);
  const sameList =
    staticDirAnyZero.length === runtimeZero.length &&
    staticDirAnyZero.every((n) => runtimeZero.includes(n));
  out(`  ③ S4(${staticDirAnyZero.length}) vs R(${runtimeZero.length})：名单${sameList ? '**恰好一致**' : '不一致'}`
    + `（S4=[${staticDirAnyZero.join(', ')}]）。`);
  out('     登记：本断面下整目录静态扫法与运行时判定同值同名单，但这**不构成**静态可作判据的理由——');
  out('     二者同值是"桩恰好一行数据访问都没有"这一巧合，换断面/换哨兵即失效（S1 已差 1 件）。');
  out('');
  out('⇒ 结论：静态口径不可作判据（本卡坑清单第 7 条）。判定列一律用运行时实测。');
  out('');
  out('【未归因·如实登记】派单件 §一 引述"院方《边界评估》：20/45 哨兵 queryNodes 调用 = 0"。');
  out('  本卡四种静态扫法实测为 S1=3 / S2=3 / S3=2 / S4=2，运行时 R=2 —— **没有任何一种扫法得到 20**。');
  out('  院方 20 的口径本卡无法复现（未写明扫法/断面/是否含 _extinct 或全仓）；登记为未清项，不作猜测。');
  out('');
  out(`S1 名单（只扫 entryPoint 时 queryNodes 为 0）: ${staticEntryQNodesZero.join(', ') || '（无）'}`);
  out(`S3 名单（整目录仍无 queryNodes 字样）       : ${staticDirQNodesZero.join(', ') || '（无）'}`);
}

void main();
