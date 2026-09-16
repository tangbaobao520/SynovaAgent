/**
 * render-onepager.ts — GS-08 场景驱动（D791：一页纸四槽位 + 各维度循环结论 + 结论可溯源）
 *
 * 一句话: 用**真实**存储/渲染路径把「诊断报告 → 一页纸四槽位 → 条条可溯源」跑成机器可判工件。
 *
 * 契约:
 *   @input  — --mode seed|audit
 *             --data-dir <临时数据目录>（fresh-db.ts 产物；库文件 = <dir>/synova.db）
 *             --out <工件输出目录>（run.sh 传 scripts/golden-scenarios/evidence/GS-08-<date>/）
 *             [--fixture <诊断报告 fixture 路径>]（默认 fixtures/diagnosis-report.json）
 *             [--org <orgId>]（默认 = fixture.teamId）
 *   @output — seed:  真实 `SqliteGraphStore` 写 2 条循环快照（writeOverflowSnapshot）+
 *                     真实 `SessionStore.saveDiagnosisCheckpoint` 写 phase=5 归档行（fixture 报告）+
 *                     渲染降级变体 onepager-degraded.md（无 inputs）/ onepager-no-snapshot.md
 *                     （有 inputs 但 store 缺席 → 全量「未建立基线」）+ cycle-slot-no-snapshot.md
 *                     + seed-meta.json（含快照复读校验结果）
 *             audit: onepager.md（生产 HTTP 产物）的 pointer-audit.json / dimension-audit.json /
 *                     onepager-meta.json / cycle-slot.md / audit-extra.json
 *   @exit   — 0 = 成功；2 = 失败/降级（fail-closed：「没跑成」绝不冒充「通过」）
 *   @degraded — fixture 读取失败 / 报告形状非法 / 图快照写入后复读校验失败（writeOverflowSnapshot
 *               静默吞写失败——必须复读才可信，见 agent/loop-handlers.ts 同款注释）/
 *               生产 markdown 不存在 → stderr `degraded: <原因>` + exit 2
 *
 * 诚实边界（场景 README + 证据 quote 双处标注）: 本场景**不跑**真实 LLM 六阶段诊断——
 * fixture 报告（内容对齐 `DiagnosisReport` 形状）+ 真实 checkpoint 归档行 + 真实生产渲染/读取路径。
 * ⇒ 断言属**契约级**：生产渲染与读取路径真实，LLM 产物为 fixture。禁止声称"全链路 LLM 诊断已验"。
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { SqliteGraphStore } from '../../../src/adapters/sqlite-graph-store';
import { SessionStore } from '../../../src/store/session-store';
import { writeOverflowSnapshot } from '../../../src/cycles/overflow-graph-bridge';
import { getCycleSnapshots } from '../../../src/cycles/overflow-graph-bridge';
import { cycleRegistry } from '../../../src/cycles/cycle-registry';
import { registerLoadedCycles } from '../../../src/cycles/cycle-loader';
import { buildCycleConclusions } from '../../../src/agent/cycle-conclusion-service';
import { renderOnePager, auditOnePagerReadability, assembleOnePagerInputs } from '../../../src/agent/report-assembler';
import { auditConclusionCoverage, resolvePointers, ONEPAGER_SLOT_TITLES } from '../../../src/agent/report-onepager-trace';
import type { OverflowSnapshot } from '../../../src/cycles/overflow-compute';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_FIXTURE = path.join(HERE, 'fixtures', 'diagnosis-report.json');

// ═══ 参数 ═══

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function degraded(reason: string): never {
  console.error(`degraded: ${reason}`);
  process.exit(2);
}

// ═══ 工件写入（UTF-8，固定 key 顺序，无缩进 JSON.stringify——断言用 contains 精确匹配）═══

function writeText(outDir: string, name: string, content: string): void {
  fs.writeFileSync(path.join(outDir, name), content, 'utf-8');
}

function writeJsonCompact(outDir: string, name: string, value: Record<string, unknown>): void {
  fs.writeFileSync(path.join(outDir, name), JSON.stringify(value), 'utf-8');
}

/** 抽取某槽位段原文（含标题行；遇下一个标题/footer 即止）——负向断言的精确作用域 */
function slotSection(markdown: string, title: string): string {
  const out: string[] = [];
  let inSlot = false;
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === title) { inSlot = true; out.push(line); continue; }
    if (!inSlot) continue;
    if (line.startsWith('#') || line.startsWith('📎')) break;
    if (line !== '') out.push(line);
  }
  return out.join('\n');
}

// ═══ fixture ═══

interface FixtureShape {
  reportId: string;
  teamId: string;
  generatedAt: string;
  summary: string;
  expertReports: unknown[];
  rootCauses: unknown[];
  recommendations: unknown[];
  raw: Record<string, unknown>;
}

function loadFixture(fixturePath: string): FixtureShape {
  let raw: string;
  try {
    raw = fs.readFileSync(fixturePath, 'utf-8');
  } catch (err: unknown) {
    degraded(`fixture 读取失败 ${fixturePath}: ${err instanceof Error ? err.message : String(err)}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: unknown) {
    degraded(`fixture JSON.parse 失败（与 ENOENT 区分——内容损坏）: ${err instanceof Error ? err.message : String(err)}`);
  }
  const r = parsed as Record<string, unknown>;
  if (
    typeof r.reportId !== 'string' || typeof r.teamId !== 'string' ||
    typeof r.generatedAt !== 'string' || typeof r.summary !== 'string' ||
    !Array.isArray(r.expertReports) || !Array.isArray(r.rootCauses) ||
    !Array.isArray(r.recommendations) || typeof r.raw !== 'object' || r.raw === null
  ) {
    degraded('fixture 形状非法（须满足 routes/diagnosis.ts isFullDiagnosisReportLike：reportId/teamId/generatedAt/summary 字符串 + expertReports/rootCauses/recommendations 数组 + raw 对象）');
  }
  return parsed as FixtureShape;
}

/** 循环快照种子（真实 OverflowSnapshot 形状；溢出为负 = 增长瓶颈语义，趋势下降） */
function seedSnapshots(orgId: string, store: SqliteGraphStore): string[] {
  const seeds: Array<Pick<OverflowSnapshot, 'cycleId' | 'month' | 'overflowValue' | 'unit'>> = [
    { cycleId: 'customer-cycle', month: '2026-08', overflowValue: -12.5, unit: '万元' },
    { cycleId: 'cash-cycle', month: '2026-08', overflowValue: -38, unit: '万元' },
  ];
  const written: string[] = [];
  for (const seed of seeds) {
    const snapshot: OverflowSnapshot = {
      cycleId: seed.cycleId,
      month: seed.month,
      overflowValue: seed.overflowValue,
      unit: seed.unit,
      trend: 'declining',
      trendDelta: -2.5,
      maturity: 'mature',
      isIndustryBaseline: false,
      momChange: -2.5,
      momChangePercent: -16.7,
      yoyChange: null,
      yoyChangePercent: null,
      trendDirection: 'declining',
      consecutiveDirection: 3,
      degraded: false,
    };
    writeOverflowSnapshot(orgId, seed.cycleId, snapshot, store);
    // writeOverflowSnapshot 静默吞写失败（overflow-graph-bridge.ts 内部 catch）——必须复读校验
    const readBack = getCycleSnapshots(orgId, seed.cycleId, store, { limit: 1 });
    if (readBack.length === 0 || readBack[0].month !== seed.month) {
      degraded(`循环快照写入后复读校验失败（cycleId=${seed.cycleId} month=${seed.month}）——图存储写路径不可信`);
    }
    written.push(`${seed.cycleId}@${seed.month}`);
  }
  return written;
}

// ═══ seed 模式 ═══

async function runSeed(dataDir: string, outDir: string, fixturePath: string, orgIdOverride?: string): Promise<void> {
  const fixture = loadFixture(fixturePath);
  const orgId = orgIdOverride ?? fixture.teamId;
  const dbPath = path.join(dataDir, 'synova.db');

  let db: Database.Database;
  try {
    db = new Database(dbPath);
  } catch (err: unknown) {
    degraded(`无法打开临时库 ${dbPath}: ${err instanceof Error ? err.message : String(err)}`);
  }

  let snapshotKeys: string[] = [];
  try {
    // 真实 L4 适配器（自建 schema + 幂等迁移）
    const graphStore = new SqliteGraphStore(db);
    snapshotKeys = seedSnapshots(orgId, graphStore);

    // 真实 L5 checkpoint 归档行（键 = reportId，phase=5；onePager=null → GET 走生产按需渲染）
    const sessionStore = new SessionStore(db);
    sessionStore.saveDiagnosisCheckpoint({
      sessionId: fixture.reportId,
      phase: 5,
      completedModules: [],
      partialReport: {
        reportId: fixture.reportId,
        teamId: fixture.teamId,
        completedAt: fixture.generatedAt,
        consultId: `gs08-consult-${fixture.reportId}`,
        source: 'consult',
        onePager: null,
        report: fixture as unknown as Record<string, unknown>,
      },
      savedAt: fixture.generatedAt,
    });
    const archived = sessionStore.getDiagnosisCheckpoint(fixture.reportId);
    if (!archived || archived.phase !== 5) {
      degraded(`checkpoint 归档行复读校验失败（reportId=${fixture.reportId}）——报告持久层不可信`);
    }
  } finally {
    db.close();
  }

  // 降级变体①: 完全不传 inputs（S2/S3/S4 走 [degraded] 空态行——R2 降级显式）
  writeText(outDir, 'onepager-degraded.md', renderOnePager(fixture as never, 'ceo'));

  // 降级变体②: 传 inputs 但 store 缺席（S3 全量「未建立基线」——R3 不造趋势的精确作用域）
  const noSnapshot = await buildCycleConclusions(orgId, null);
  const noSnapshotMd = renderOnePager(
    fixture as never,
    'ceo',
    assembleOnePagerInputs([], noSnapshot.lines.map(line => line.text)),
  );
  writeText(outDir, 'onepager-no-snapshot.md', noSnapshotMd);
  writeText(outDir, 'cycle-slot-no-snapshot.md', slotSection(noSnapshotMd, '### 各维度循环结论'));

  writeJsonCompact(outDir, 'seed-meta.json', {
    orgId,
    reportId: fixture.reportId,
    snapshotsWritten: snapshotKeys,
    noSnapshotLines: noSnapshot.lines.length,
    noSnapshotReason: noSnapshot.reason ?? null,
  });
  console.log(`[render-onepager] seed 完成: 快照 ${snapshotKeys.join(',')}；归档报告 ${fixture.reportId}`);
}

// ═══ audit 模式 ═══

/** 直读物理记录（不复用产品查询路径——审计独立性的最低要求：验的是记录存在，不是代码自证） */
function readSnapshotRecords(dbPath: string, orgId: string): Map<string, string[]> {
  const db = new Database(dbPath, { readonly: true });
  try {
    const rows = db
      .prepare("SELECT props FROM graph_nodes WHERE graph = ? AND type = 'OVERFLOW_SNAPSHOT' AND valid_to IS NULL")
      .all(`${orgId}:cycles`) as Array<{ props: string }>;
    const out = new Map<string, string[]>();
    for (const row of rows) {
      let props: Record<string, unknown>;
      try {
        props = JSON.parse(row.props) as Record<string, unknown>;
      } catch {
        continue; // 损坏行跳过（不静默当"无快照"——下方以 null 区分）
      }
      const cycleId = typeof props.cycleId === 'string' ? props.cycleId : '';
      const month = typeof props.month === 'string' ? props.month : '';
      if (cycleId === '' || month === '') continue;
      const list = out.get(cycleId) ?? [];
      list.push(month);
      out.set(cycleId, list);
    }
    return out;
  } finally {
    db.close();
  }
}

async function runAudit(dataDir: string, outDir: string, fixturePath: string, orgIdOverride?: string): Promise<void> {
  const fixture = loadFixture(fixturePath);
  const orgId = orgIdOverride ?? fixture.teamId;
  const dbPath = path.join(dataDir, 'synova.db');

  const onepagerPath = path.join(outDir, 'onepager.md');
  let onepager: string;
  try {
    onepager = fs.readFileSync(onepagerPath, 'utf-8');
  } catch (err: unknown) {
    degraded(`生产 markdown 读取失败 ${onepagerPath}（HTTP 路径未产出）: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (onepager.trim() === '') degraded('生产 markdown 为空串（HTTP 端点未渲染一页纸）');

  // ── ① 指针解析审计（真实物理记录解析器：报告自身 + 图快照节点）──
  const records = readSnapshotRecords(dbPath, orgId);
  const audit = resolvePointers(onepager, {
    report: (_kind, ref) => ref.startsWith(`${fixture.reportId}#`),
    cycle: (_kind, ref) => {
      const at = ref.lastIndexOf('@');
      if (at <= 0) return false;
      const cycleId = ref.slice(0, at);
      const month = ref.slice(at + 1);
      const months = records.get(cycleId);
      if (month === 'none') return months === undefined || months.length === 0;
      return months !== undefined && months.includes(month);
    },
  });
  const coverage = auditConclusionCoverage(onepager);
  writeJsonCompact(outDir, 'pointer-audit.json', {
    conclusionLines: coverage.conclusionLines,
    linesWithPointer: coverage.linesWithPointer,
    missingPointerLines: coverage.missingPointerLines,
    totalPointers: audit.total,
    resolvedCount: audit.resolvedCount,
    unresolvedCount: audit.unresolvedCount,
    unknownCount: audit.unknownCount,
    externalResolvableCount: audit.externalResolvableCount,
  });

  // ── ② 维度审计（S3 渲染集合 vs 注册表全集）──
  const loaded = await registerLoadedCycles();
  if (loaded.errors.length > 0) {
    console.error(`degraded: 循环注册存在错误 ${loaded.errors.length} 条（继续，但维度审计基线可疑）`);
  }
  const registered = cycleRegistry.list().map(c => c.cycleId);
  const s3 = slotSection(onepager, ONEPAGER_SLOT_TITLES[2]);
  const rendered = new Set<string>();
  for (const m of s3.matchAll(/\[src:cycle:([^@\]]+)@/g)) rendered.add(m[1]);
  const renderedList = [...rendered];
  if (registered.length === 0) degraded('注册循环数为 0（cycles/ 加载失败）——维度审计无基线，fail-closed');
  const missing = registered.filter(id => !rendered.has(id));
  const unregistered = renderedList.filter(id => !registered.includes(id));
  writeJsonCompact(outDir, 'dimension-audit.json', {
    registeredCount: registered.length,
    renderedCount: renderedList.length,
    missingDimensionCount: missing.length,
    unregisteredDimensionCount: unregistered.length,
  });

  // ── ③ 篇幅工件 + 确定性 ──
  const metrics = auditOnePagerReadability(onepager);
  // 确定性: 同输入两次渲染字节相等（禁渲染时刻；spec §5.2）
  const store = (() => {
    try {
      const db = new Database(dbPath);
      return new SqliteGraphStore(db);
    } catch (err: unknown) {
      console.error(`degraded: 本地渲染用图存储不可用: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  })();
  const localConclusions = await buildCycleConclusions(orgId, store);
  // 与 L1 routes/diagnosis 的 inputs 装配同源（L2 assembleOnePagerInputs）——保证等价性可判
  const localInputs = assembleOnePagerInputs([], localConclusions.lines.map(line => line.text));
  const renderA = renderOnePager(fixture as never, 'ceo', localInputs);
  const renderB = renderOnePager(fixture as never, 'ceo', localInputs);
  const deterministic = renderA === renderB;
  writeJsonCompact(outDir, 'onepager-meta.json', {
    charCount: metrics.charCount,
    maxLineChars: metrics.maxLineChars,
    slotCount: metrics.slotCount,
    slotsOk: metrics.slotsOk,
    budgetOk: metrics.budgetOk,
    conclusionCharsOk: metrics.conclusionCharsOk,
    maxLineOk: metrics.maxLineOk,
    deterministic,
  });

  // ── ④ S3 槽位片段（负向断言 11 的精确作用域）+ 诊断附加面 ──
  writeText(outDir, 'cycle-slot.md', s3);
  writeJsonCompact(outDir, 'audit-extra.json', {
    httpMatchesLocal: onepager === renderA,
    localRenderChars: renderA.replace(/\s+/g, '').length,
    httpRenderChars: metrics.charCount,
    registeredCycles: registered,
    renderedCycles: renderedList,
  });

  console.log(
    `[render-onepager] audit: 指针 ${audit.total}（resolved ${audit.resolvedCount} / unresolved ${audit.unresolvedCount} / unknown ${audit.unknownCount}）；` +
    `外部可溯源 ${audit.externalResolvableCount}；维度 ${renderedList.length}/${registered.length}；` +
    `篇幅 ${metrics.charCount}/1200；单行 ${metrics.maxLineChars}/60；确定性 ${deterministic}；HTTP≡本地渲染 ${onepager === renderA}`,
  );
}

// ═══ main ═══

async function main(): Promise<void> {
  const mode = arg('--mode');
  const dataDir = arg('--data-dir');
  const outDir = arg('--out');
  if (!mode || !dataDir || !outDir) degraded('用法: --mode seed|audit --data-dir <临时数据目录> --out <工件目录>');
  if (mode !== 'seed' && mode !== 'audit') degraded(`未知 --mode ${mode}（可选 seed|audit）`);
  if (!fs.existsSync(dataDir)) degraded(`--data-dir 不存在: ${dataDir}`);
  fs.mkdirSync(outDir, { recursive: true });

  const fixturePath = arg('--fixture') ?? DEFAULT_FIXTURE;
  const org = arg('--org');
  if (mode === 'seed') await runSeed(dataDir, outDir, fixturePath, org);
  else await runAudit(dataDir, outDir, fixturePath, org);
}

main().catch((err: unknown) => {
  degraded(`未捕获异常: ${err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err)}`);
});
