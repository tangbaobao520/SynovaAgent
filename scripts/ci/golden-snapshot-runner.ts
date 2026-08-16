/**
 * scripts/ci/golden-snapshot-runner.ts — D396 黄金用例快照执行器
 *
 * 契约（铁律 47 — 契约优先，先定义再实现）:
 *   @input  — section: 各层快照段（ComputeSnapshotSection / FindingsSnapshotSection / ExpertReportSection）
 *   @output — SnapshotCheckResult { passed: boolean; degraded: boolean; diffs: string[] }
 *             纯函数，可单测；diffs 为人类可读的逐字段差异或错误清单
 *   @degraded — fixture 声明了快照段但缺 snapshot → passed:false + degraded:true + stderr（铁律 11 显式降级）
 *               compute/aggregate 执行抛错 → passed:false + degraded:true + stderr（铁律 24 不空吞）
 *   @error  — function 名未登记 → passed:false + degraded:false + "未登记"（不静默 skip，K3 验收锚点）
 *
 * 职责（K3 咨询 §4.3「神 = 可复现」）:
 *   真跑 compute 纯函数 / 哨兵 findings 聚合 / 专家报告结构断言，与冻结快照逐字段 diff。
 *   只做快照层，不碰 F1 判定逻辑（computeF1Score/deriveActual 在 golden-case-checker.ts，冻结）。
 */
import { computeCashRunway } from '../../extensions/sentinels/financing-constraint/computes/cash-runway';

// ═══ 类型定义 ═══

/** 快照检查统一结果（三层共用） */
export interface SnapshotCheckResult {
  passed: boolean;
  degraded: boolean;
  diffs: string[];
}

/** fixture.compute 段 — compute 快照契约 */
export interface ComputeSnapshotSection {
  function: string;
  input: unknown;
  snapshot?: Record<string, unknown>;
}

/** finding 快照条目（id/severity/title 三字段） */
export interface FindingSnapshot {
  id: string;
  severity: string;
  title: string;
}

/** fixture.findings 段 — findings 快照契约 */
export interface FindingsSnapshotSection {
  function: string;
  input: unknown;
  snapshot?: FindingSnapshot[];
}

/** 专家报告快照（结构化断言，不做 LLM 全文 diff） */
export interface ExpertReportSnapshot {
  expert: string;
  summary: string;
  confidence: number;
  checkedAt: string;
}

/** fixture.expertReport 段 — 专家报告结构断言契约 */
export interface ExpertReportSection {
  snapshot?: ExpertReportSnapshot;
}

/** findings 集合 diff 结果 */
export interface FindingsDiff {
  missing: string[];
  extra: string[];
  mismatched: string[];
}

// ═══ 函数登记表（增量登记 D355-D360 修复对象，本任务示范 compute 层） ═══

/**
 * computeFnRegistry — compute 函数名 → 真实纯函数映射。
 * 契约: 只映射"纯 compute 函数"（无 DB/无副作用），输入/输出由 fixture 的
 *       compute.input/snapshot 定义。未登记的 function 名 → runComputeSnapshot
 *       显式失败（不静默 skip）。
 */
export const computeFnRegistry: Record<string, (input: unknown) => unknown> = {
  computeCashRunway: (input) =>
    computeCashRunway(input as Array<{ cash: number; operatingExpense: number }>),
};

/**
 * findingsFnRegistry — 哨兵 aggregate 名 → 真实函数映射（增量登记）。
 * 本任务只示范 compute 层（spec §3.3: 全诊断管线端到端跑归 GSS D361+），
 * findings 层机制就位但登记表留空，后续 D355-D360 aggregate 按同契约登记。
 */
export const findingsFnRegistry: Record<string, (input: unknown) => FindingSnapshot[]> = {};

// ═══ diff 工具 ═══

/** 类型守卫: 纯对象（非数组/非 null） */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * diffObjects — 递归逐字段 diff（compute 全 diff 核心）。
 * 输出人类可读差异串，如 `signal: 期望 "critical" 实际 "warning"`。
 * 不抛错——任何形状的输入都能产出 diff 清单。
 */
function diffObjects(actual: unknown, expected: unknown, path: string, diffs: string[]): void {
  if (isPlainObject(expected) && isPlainObject(actual)) {
    const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
    for (const key of keys) {
      const childPath = path ? `${path}.${key}` : key;
      if (!(key in actual)) {
        diffs.push(`${childPath}: 缺失（期望 ${JSON.stringify(expected[key])}）`);
      } else if (!(key in expected)) {
        diffs.push(`${childPath}: 多余（实际 ${JSON.stringify(actual[key])}）`);
      } else {
        diffObjects(actual[key], expected[key], childPath, diffs);
      }
    }
    return;
  }
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) {
      diffs.push(`${path}: 数组长度 期望 ${expected.length} 实际 ${actual.length}`);
    }
    const len = Math.max(expected.length, actual.length);
    for (let i = 0; i < len; i++) {
      diffObjects(actual[i], expected[i], `${path}[${i}]`, diffs);
    }
    return;
  }
  if (actual !== expected) {
    diffs.push(`${path}: 期望 ${JSON.stringify(expected)} 实际 ${JSON.stringify(actual)}`);
  }
}

// ═══ 三层快照检查 ═══

/**
 * runComputeSnapshot — compute 全 diff（层 1）。
 * 查 registry 跑真实 compute 函数 → 输出 vs 冻结 snapshot 逐字段 deep-equal。
 */
export function runComputeSnapshot(section: ComputeSnapshotSection): SnapshotCheckResult {
  const fn = computeFnRegistry[section.function];
  if (!fn) {
    return {
      passed: false,
      degraded: false,
      diffs: [`compute function "${section.function}" 未登记（computeFnRegistry）`],
    };
  }
  if (!section.snapshot) {
    console.error(`[golden-snapshot-runner] compute.snapshot 缺失 (function=${section.function})`);
    return { passed: false, degraded: true, diffs: ['compute.snapshot 缺失 — 显式降级，不静默 pass'] };
  }
  let actual: unknown;
  try {
    actual = fn(section.input);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[golden-snapshot-runner] compute "${section.function}" 执行失败: ${msg}`);
    return { passed: false, degraded: true, diffs: [`compute "${section.function}" 执行失败: ${msg}`] };
  }
  const diffs: string[] = [];
  diffObjects(actual, section.snapshot, '', diffs);
  return { passed: diffs.length === 0, degraded: false, diffs };
}

/**
 * diffFindings — findings 集合 diff（层 2 核心纯函数）。
 * 按 id 对账：missing（快照有实际无）/ extra（实际有快照无）/ mismatched（id 同但 severity/title 异）。
 */
export function diffFindings(actual: FindingSnapshot[], snapshot: FindingSnapshot[]): FindingsDiff {
  const actualById = new Map(actual.map((f) => [f.id, f]));
  const snapshotById = new Map(snapshot.map((f) => [f.id, f]));
  const missing: string[] = [];
  const extra: string[] = [];
  const mismatched: string[] = [];
  for (const id of snapshotById.keys()) {
    if (!actualById.has(id)) missing.push(id);
  }
  for (const id of actualById.keys()) {
    if (!snapshotById.has(id)) extra.push(id);
  }
  for (const id of snapshotById.keys()) {
    const a = actualById.get(id);
    const s = snapshotById.get(id);
    if (a && s && (a.severity !== s.severity || a.title !== s.title)) mismatched.push(id);
  }
  return { missing, extra, mismatched };
}

/**
 * runFindingsSnapshot — findings 全 diff（层 2）。
 * 查 findingsFnRegistry 跑真实 aggregate → findings 列表 vs 冻结快照（id/severity/title 集合 diff）。
 */
export function runFindingsSnapshot(section: FindingsSnapshotSection): SnapshotCheckResult {
  const fn = findingsFnRegistry[section.function];
  if (!fn) {
    return {
      passed: false,
      degraded: false,
      diffs: [`findings function "${section.function}" 未登记（findingsFnRegistry）`],
    };
  }
  if (!section.snapshot) {
    console.error(`[golden-snapshot-runner] findings.snapshot 缺失 (function=${section.function})`);
    return { passed: false, degraded: true, diffs: ['findings.snapshot 缺失 — 显式降级，不静默 pass'] };
  }
  let actual: FindingSnapshot[];
  try {
    actual = fn(section.input);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[golden-snapshot-runner] findings "${section.function}" 执行失败: ${msg}`);
    return { passed: false, degraded: true, diffs: [`findings "${section.function}" 执行失败: ${msg}`] };
  }
  const d = diffFindings(actual, section.snapshot);
  const diffs: string[] = [
    ...d.missing.map((id) => `missing finding: ${id}`),
    ...d.extra.map((id) => `extra finding: ${id}`),
    ...d.mismatched.map((id) => `mismatched finding: ${id}`),
  ];
  return { passed: diffs.length === 0, degraded: false, diffs };
}

/**
 * runExpertReportAssertion — 专家报告结构断言（层 3）。
 * 断言字段存在性 + 值域（expert/summary 非空、confidence ∈ [0,1]、checkedAt 合法 ISO）。
 * 不做 LLM 全文 diff（K3 原文: 模型非确定性部分用结构化断言）。
 */
export function runExpertReportAssertion(section: ExpertReportSection): SnapshotCheckResult {
  if (!section.snapshot) {
    console.error('[golden-snapshot-runner] expertReport.snapshot 缺失');
    return { passed: false, degraded: true, diffs: ['expertReport.snapshot 缺失 — 显式降级，不静默 pass'] };
  }
  const { expert, summary, confidence, checkedAt } = section.snapshot;
  const diffs: string[] = [];
  if (typeof expert !== 'string' || expert.trim().length === 0) {
    diffs.push('expert 非空字符串断言失败');
  }
  if (typeof summary !== 'string' || summary.trim().length === 0) {
    diffs.push('summary 非空字符串断言失败');
  }
  if (typeof confidence !== 'number' || Number.isNaN(confidence) || confidence < 0 || confidence > 1) {
    diffs.push(`confidence ∈ [0,1] 断言失败: ${String(confidence)}`);
  }
  if (typeof checkedAt !== 'string' || Number.isNaN(Date.parse(checkedAt))) {
    diffs.push(`checkedAt 合法 ISO 时间戳断言失败: ${String(checkedAt)}`);
  }
  return { passed: diffs.length === 0, degraded: false, diffs };
}
