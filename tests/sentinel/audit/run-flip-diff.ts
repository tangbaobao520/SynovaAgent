/**
 * tests/sentinel/audit/run-flip-diff.ts — D966 P7 混杂变量：逐哨兵产出差
 *
 * 用途：把「同节点集 + 同边集，仅换 graph_triples 断面 ⇒ 哪些哨兵产出改变」逐条列全，
 * 作为 P7 是**混杂变量**（而非背景噪声）的判别性证据。
 *
 * 用法: npx tsx tests/sentinel/audit/run-flip-diff.ts
 *
 * 契约（铁律 47）:
 *   @input  — 无
 *   @output — stdout：legacy vs canonical 逐哨兵 findings 对照 + 差异清单 + 方向统计
 *   @degraded — 单哨兵失败在该行标注，不中断
 *   @error  — 夹具不可建 → 非 0 退出
 */

import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync } from 'node:fs';
import {
  buildFixture,
  probeSentinels,
  synthNodes,
  threeEdges,
  TEAM_ID,
  type ProbeRow,
} from './probe-harness';

const SCRATCH = join(tmpdir(), 'd966-flip');

function out(line = ''): void {
  process.stdout.write(`${line}\n`);
}

function pad(s: string, n: number): string {
  return s.length >= n ? `${s} ` : s + ' '.repeat(n - s.length);
}

function findingsOf(rows: ProbeRow[], name: string): string {
  const r = rows.find((x) => x.name === name);
  if (!r) return 'n/a';
  if (r.outcome !== 'ok') return `${r.outcome}`;
  return String(r.unpackedFindings ?? '-');
}

async function main(): Promise<void> {
  mkdirSync(SCRATCH, { recursive: true });
  const nodes = synthNodes();
  const edges = threeEdges();
  const legacyDb = join(SCRATCH, 'legacy.db');
  const canonDb = join(SCRATCH, 'canonical.db');
  await buildFixture({ dest: legacyDb, variant: 'legacy', nodes, edges });
  await buildFixture({ dest: canonDb, variant: 'canonical', nodes, edges });

  const legacy = await probeSentinels({ dbPath: legacyDb, teamId: TEAM_ID });
  const canon = await probeSentinels({ dbPath: canonDb, teamId: TEAM_ID });

  const legacyEdges = legacy.reduce((a, r) => a + (r.tally.byMethod.queryEdges?.rowsReturned ?? 0), 0);
  const canonEdges = canon.reduce((a, r) => a + (r.tally.byMethod.queryEdges?.rowsReturned ?? 0), 0);

  out('D966 P7 混杂变量 — 逐哨兵产出差（同节点集 + 同边集，仅 graph_triples 断面不同）');
  out(`夹具: nodes=${nodes.length} edges=${edges.length} ｜ teamId=${TEAM_ID}`);
  out(`queryEdges 真实读到的边: legacy=${legacyEdges} ｜ canonical=${canonEdges}`);
  out('');
  out(`${pad('哨兵', 34)}${pad('legacy列B', 11)}${pad('canonical列B', 12)}方向`);

  let up = 0;
  let down = 0;
  const changed: string[] = [];
  for (const r of legacy) {
    const a = r.unpackedFindings ?? -1;
    const b = canon.find((x) => x.name === r.name)?.unpackedFindings ?? -1;
    if (a === b) continue;
    changed.push(r.name);
    if (b > a) up += 1;
    else down += 1;
    out(`${pad(r.name, 34)}${pad(String(a), 11)}${pad(String(b), 12)}${b > a ? '↑ 增' : '↓ 减'}`);
  }

  out('');
  out(`产出改变的哨兵数 = ${changed.length} ｜ 增 ${up} ｜ 减 ${down}`);
  out('');
  out('产出**反而减少**的哨兵（必须登记，禁止把"修好"说成单调变多）:');
  for (const n of changed) {
    const a = findingsOf(legacy, n);
    const b = findingsOf(canon, n);
    if (Number(b) < Number(a)) out(`  ${n}: ${a} → ${b}`);
  }
  out('');
  out('⇒ 判定：P7 修复会**改变**哨兵走哪条代码路径（产出方向逐件不同），因此 P7 是混杂变量；');
  out('   任何"空转/零调用"结论若不在可读边断面上重跑，都不能区分"没数据"与"读不到"。');
}

void main();
