/**
 * tests/sentinel/audit/run-runtime-probe.ts — D966 运行时口径复现（口径 A / A2）
 *
 * 用法:
 *   npx tsx tests/sentinel/audit/run-runtime-probe.ts baseline
 *   npx tsx tests/sentinel/audit/run-runtime-probe.ts misspec
 *
 * 目的:
 *   baseline — 复刻 loader 口径（entryPoint/exportKey 尊重 manifest + 四参注入），
 *              在**生产库一致性只读快照**（图两表为空）上跑全部哨兵（数 = loadSentinels().sentinels.length），产出 Done 要求的双列数字。
 *   misspec  — 复刻 CTO 派单件 §一 的方法（硬编码 ./aggregate.ts、二参调用），
 *              用于对「CTO 报零 finding=23 vs 本卡实测」做**可证伪的差异归因**。
 *
 * 契约（铁律 47）:
 *   @input  — argv[2] ∈ {baseline, misspec}
 *   @output — stdout：原始表格 + 汇总（供逐字粘贴进 evidence，禁手写数字）
 *   @degraded — 单哨兵失败记入表格 error 列，不中断（探针整体仍返回 0）
 *   @error  — 夹具 DB 不可建立 / 生产库不可读 → 非 0 退出（前置失败不得伪装成零 finding）
 */

import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync } from 'node:fs';
import {
  buildFixture,
  probeSentinels,
  summarize,
  fileInfo,
  inspectProdSchema,
  PROD_DB,
  type ProbeOptions,
  type ProbeRow,
} from './probe-harness';

const SCRATCH = join(tmpdir(), 'd966-probe');

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

function renderRows(rows: ProbeRow[], label: string): void {
  head(`${label} — 逐哨兵原始结果（${rows.length} 行）`);
  out(
    `${pad('#', 3)}${pad('哨兵', 34)}${pad('entry', 20)}${pad('数组', 5)}${pad('列A', 5)}${pad('列B', 5)}${pad('deg', 5)}${pad('store', 7)}${pad('成功/失败', 10)}${pad('qE(调用/成功/失败)', 19)}${pad('qE行数', 7)}${pad('SQL失败', 8)}形态`,
  );
  rows.forEach((r, i) => {
    const qe = r.tally.byMethod.queryEdges;
    out(
      `${pad(String(i + 1), 3)}${pad(r.name, 34)}${pad(r.entryPoint, 20)}${pad(
        r.rawIsArray === null ? '-' : r.rawIsArray ? '是' : '否',
        5,
      )}${pad(String(r.arrayFindings ?? '-'), 5)}${pad(String(r.unpackedFindings ?? '-'), 5)}${pad(
        String(r.unpackedDegraded ?? '-'),
        5,
      )}${pad(String(r.tally.total), 7)}${pad(`${r.tally.ok}/${r.tally.failed}`, 10)}${pad(
        qe ? `${qe.calls}/${qe.ok}/${qe.failed}` : '0/0/0',
        19,
      )}${pad(String(qe ? qe.rowsReturned : 0), 7)}${pad(String(r.sqlPrepareFailed), 8)}${r.rawKind}${
        r.error ? ` ERR=${r.error}` : ''
      }`,
    );
  });
}

function renderSummary(rows: ProbeRow[], label: string): void {
  const s = summarize(rows);
  head(`${label} — 汇总（全部为原始实测值，禁手写）`);
  out(`哨兵总数                     = ${s.total}`);
  out(`raw 为数组（列 A 可计）       = ${s.arrays}`);
  out(`raw 非数组                    = ${s.nonArray}  [${s.nonArrayNames.join(', ')}]`);
  out(`抛错 / 加载失败               = ${s.threw}  [${s.threwNames.join(', ')}]`);
  out(`entryPoint 缺件               = ${s.missingEntry}`);
  out(`exportKey 无 check()          = ${s.noCheckMethod}`);
  out(`零 finding（列 A 数组口径）   = ${s.zeroFindingsArrayScope}`);
  out(`零 finding（列 B loader 口径）= ${s.zeroFindingsUnpackedScope}   ← 判定列`);
  out(`store 调用 = 0 的哨兵         = ${s.zeroStoreCalls.length}  [${s.zeroStoreCalls.join(', ')}]`);
  out(`store 调用全失败（≥1 调用全红）= ${s.storeCallsAllFailed.length}  [${s.storeCallsAllFailed.join(', ')}]`);
  out(
    `queryEdges 逐哨兵面           = 有调用 ${s.queryEdgesAttempted} ｜ 方法层"成功" ${s.queryEdgesOk} ｜ 方法层全失败 ${s.queryEdgesFailed}`,
  );
  out(`queryEdges 调用总次数         = ${s.queryEdgesCalls}`);
  out(`queryEdges 真的读到的边行数   = ${s.queryEdgesRowsReturned}   ← 判定量（补列前应恒 0）`);
  out(`SQL 层 prepare 调用/失败      = ${s.sqlPrepareCalls} / ${s.sqlPrepareFailed}`);
  out(`SQL 层出现失败的哨兵数        = ${s.sentinelsWithSqlFailure.length}  [${s.sentinelsWithSqlFailure.join(', ')}]`);
  out('');
  out(`零 finding 名单（列 A）: ${s.zeroFindingsArrayNames.join(', ')}`);
  out(`零 finding 名单（列 B）: ${s.zeroFindingsUnpackedNames.join(', ')}`);
}

async function freshFixture(dest: string): Promise<void> {
  mkdirSync(SCRATCH, { recursive: true });
  await buildFixture({ dest, variant: 'legacy' });
}

async function runBaseline(): Promise<void> {
  const dest = join(SCRATCH, 'baseline-prod-snapshot.db');
  await freshFixture(dest);
  out(`夹具 = 生产库一致性只读快照（未加任何合成数据）: ${JSON.stringify(fileInfo(dest))}`);
  out(`生产库只读断面: ${JSON.stringify(inspectProdSchema())}`);

  const loaderOpts: ProbeOptions = {
    dbPath: dest,
    entryPointMode: 'manifest',
    exportKeyMode: 'manifest',
    argMode: 'loader4',
    thresholdsMode: 'manifest',
  };

  const rows = await probeSentinels(loaderOpts);
  renderRows(rows, '口径 A/A2（loader 口径：manifest.entryPoint + manifest.exportKey + 四参注入）');
  renderSummary(rows, '口径 A/A2');
}

async function runMisspec(): Promise<void> {
  const dest = join(SCRATCH, 'misspec-prod-snapshot.db');
  await freshFixture(dest);

  const variants: Array<{ label: string; opts: ProbeOptions }> = [
    {
      label: 'V1 loader 口径（manifest.entryPoint + manifest.exportKey + 四参）',
      opts: { dbPath: dest, entryPointMode: 'manifest', exportKeyMode: 'manifest', argMode: 'loader4', thresholdsMode: 'manifest' },
    },
    {
      label: 'V2 硬编码 aggregate.ts + manifest.exportKey + 四参',
      opts: { dbPath: dest, entryPointMode: 'aggregate', exportKeyMode: 'manifest', argMode: 'loader4', thresholdsMode: 'manifest' },
    },
    {
      label: 'V3 硬编码 aggregate.ts + manifest.exportKey + 二参 check(store, teamId)',
      opts: { dbPath: dest, entryPointMode: 'aggregate', exportKeyMode: 'manifest', argMode: 'cto2', thresholdsMode: 'none' },
    },
    {
      label: 'V4 manifest.entryPoint + manifest.exportKey + 二参 check(store, teamId)',
      opts: { dbPath: dest, entryPointMode: 'manifest', exportKeyMode: 'manifest', argMode: 'cto2', thresholdsMode: 'none' },
    },
    {
      label: 'V5 manifest.entryPoint + manifest.exportKey + 三参（无 thresholds）',
      opts: { dbPath: dest, entryPointMode: 'manifest', exportKeyMode: 'manifest', argMode: 'loader3', thresholdsMode: 'none' },
    },
    {
      label: 'V6 硬编码 aggregate.ts + 四参 + thresholds 空表',
      opts: { dbPath: dest, entryPointMode: 'aggregate', exportKeyMode: 'manifest', argMode: 'loader4', thresholdsMode: 'none' },
    },
  ];

  head('CTO 口径复刻矩阵（用于 23 vs 实测 的差异归因）');
  out('CTO 派单件 §一 声明: 返回数组=42 ｜ 抛错=3 ｜ 零 finding=23 ｜ store 调用=0 的=2');
  out('   异常清单: path-dependency(aggregate 缺件) / forecast-accuracy(非数组) / pricing-strategy(非数组)');
  out('');
  out(
    `${pad('变体', 62)}${pad('数组', 6)}${pad('非数组', 7)}${pad('抛错', 6)}${pad('零A', 6)}${pad('零B', 6)}${pad('零C', 6)}${pad('零调用', 7)}`,
  );
  for (const v of variants) {
    const rows = await probeSentinels(v.opts);
    const s = summarize(rows);
    out(
      `${pad(v.label, 62)}${pad(String(s.arrays), 6)}${pad(String(s.nonArray), 7)}${pad(String(s.threw), 6)}${pad(
        String(s.zeroFindingsArrayScope),
        6,
      )}${pad(String(s.zeroFindingsUnpackedScope), 6)}${pad(String(s.zeroFindingsAnyOutcome), 6)}${pad(
        String(s.zeroStoreCalls.length),
        7,
      )}`,
    );
  }

  out('');
  head('CTO 口径异常清单核对（V3：硬编码 aggregate.ts + 二参）');
  const ctoRows = await probeSentinels({
    dbPath: dest,
    entryPointMode: 'aggregate',
    exportKeyMode: 'manifest',
    argMode: 'cto2',
    thresholdsMode: 'none',
  });
  const anomalies = ctoRows.filter((r) => r.outcome !== 'ok');
  for (const r of anomalies) {
    out(`  ${pad(r.name, 32)} outcome=${r.outcome} err=${r.error ?? '-'}`);
  }
  out(`  异常总数 = ${anomalies.length}`);
}

async function main(): Promise<void> {
  const mode = process.argv[2] ?? 'baseline';
  out(`D966 运行时口径探针 ｜ mode=${mode}`);
  out(`生产库（只读）: ${PROD_DB}`);
  out(`夹具根: ${SCRATCH}`);
  if (mode === 'baseline') {
    await runBaseline();
  } else if (mode === 'misspec') {
    await runMisspec();
  } else {
    out(`未知 mode: ${mode}`);
    process.exitCode = 2;
  }
}

void main();
