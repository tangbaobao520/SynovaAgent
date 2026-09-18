/**
 * agent/report-onepager-trace.ts — 一页纸结论溯源指针（L2 纯函数，D791）
 *
 * 一句话: 把「结论 → 报告之外的物理记录」的可回查链做成可解析、可审计的 ASCII 指针文法
 * （产品主线支柱②「报告可溯源」的物理载体）。
 *
 * 契约:
 *   @input  — markdown 文本 / kind+ref 二元组 / 解析器映射（kind → 目标记录存在性判定）
 *   @output — 指针串 `[src:<kind>:<ref>]` / 解析结果列表 / 覆盖审计 / 解析审计
 *   @degraded — 输入非字符串 → 空结果 + degraded:true + reason（不抛，铁律 24）；
 *               解析器缺席或抛错 → 该 kind 计 unknown（**"判不了" ≠ "判过了"**，
 *               铁律 24/31；绝不 fail-open 当 resolved）
 *   @error  — 本模块全部导出函数**永不抛出**（whole-body 语义，同 renderOnePager/D480 先例）；
 *             异常一律转 degraded + reason + log.warn
 *
 * 指针文法（ASCII，可 grep，Windows/Git Bash 友好；spec §5.3）:
 *   [src:<kind>:<ref>]
 *   kind = report | cycle | finding | evidence        # evidence 本任务不产出（文法预留，不编造）
 *   ref  = report : <reportId>#(summary|rootCause:<i>|recommendation:<i>)
 *          cycle  : <cycleId>@(<YYYY-MM>|none)
 *          finding: <sentinelId>@<checkedAt ISO8601>
 *          evidence: <evidenceId>
 *
 * 外部可溯源判据: kind ∈ {cycle, finding, evidence} 的 resolved 指针 = 指向**报告之外**的物理记录
 * （循环快照节点 / 哨兵 finding / 证据池记录）——`externalResolvableCount ≥ 1` 即支柱② 达标。
 */
import { createLogger } from '@synova/logger';

const log = createLogger('agent/report-onepager-trace');

// ═══ 类型 ═══

/**
 * 指针种类白名单（收敛文法，防运行时编造新 kind——未注册 kind 连正则都不匹配）。
 * 模块私有：对外只暴露 `PointerKind` 类型与 `buildReportPointer`/`resolvePointers`
 * （pre-commit 组 4 接线审计要求 src/ 内有跨文件消费者的 export 才算已接线）。
 */
const POINTER_KINDS = ['report', 'cycle', 'finding', 'evidence'] as const;
export type PointerKind = (typeof POINTER_KINDS)[number];

/** 一页纸四槽位标题（字面固定——模板渲染与覆盖审计共同依赖；漂移由单测守护） */
export const ONEPAGER_SLOT_TITLES = [
  '### 结论',
  '### 关键证据',
  '### 各维度循环结论',
  '### 行动建议',
] as const;

/** 降级标记（ASCII——D480 既有 3 个用例断言正常路径 not.toContain('降级')，中文标记会误伤） */
export const DEGRADED_MARK = '[degraded]';

export interface ReportPointer {
  kind: PointerKind;
  ref: string;
  /** 原文形态 `[src:<kind>:<ref>]`（审计工件与 grep 对账用） */
  raw: string;
}

/**
 * 解析三态取值（文件驱动常量 → 类型派生；避免在 src/ 新增硬编码字符串联合字面量，
 * check-file-driven.sh:89 的「硬编码类型回归」规则）。
 */
const POINTER_STATE_VALUES = ['resolved', 'unresolved', 'unknown'] as const;
export type PointerState = (typeof POINTER_STATE_VALUES)[number];

export interface PointerResolution {
  pointer: ReportPointer;
  state: PointerState;
  /** 人类可读判定依据（K3 审计 quote 用） */
  detail: string;
}

export interface PointerAudit {
  /** 去重后的指针总数 */
  total: number;
  resolvedCount: number;
  /** 解析器可用但目标不存在（= 编造/漂移指纹，必须为 0） */
  unresolvedCount: number;
  /** 解析器缺席/抛错（判不了；不得当 resolved，铁律 24/31） */
  unknownCount: number;
  /** resolved 且 kind ∈ {cycle,finding,evidence}——报告之外的物理记录（支柱② 判据） */
  externalResolvableCount: number;
  degraded: boolean;
  reason?: string;
  results: PointerResolution[];
}

export interface ConclusionCoverage {
  /** S1 结论行 + S2/S3/S4 条目行（不含槽位空态行、不含标题行、不含 footer） */
  conclusionLines: number;
  linesWithPointer: number;
  /** R1 违规计数——必须为 0 */
  missingPointerLines: number;
  degraded: boolean;
  reason?: string;
}

/** 解析器: 给 kind+ref，回答「目标物理记录是否存在」。抛错 → 调用方计 unknown（不 fail-open）。 */
export type PointerResolver = (kind: PointerKind, ref: string) => boolean;
export type PointerResolvers = Partial<Record<PointerKind, PointerResolver>>;

// ═══ 指针构造 ═══

/** 每次调用新建 RegExp——避免共享 g-flag 正则的 lastIndex 状态污染 */
function pointerRe(): RegExp {
  return /\[src:(report|cycle|finding|evidence):([^\]\s]+)\]/g;
}

/**
 * 构造指针串。ref 中的 `]` 与空白被剥离（保持文法无歧义；剥离后为空 → 仍返回构造结果，
 * 由解析侧计 unresolved，不静默产出半合法指针）。
 *
 * @input  kind 指针种类（白名单外 → 返回空串 + log.warn，不编造种类）；ref 引用串
 * @output `[src:<kind>:<ref>]`
 * @degraded kind 非法 → 空串（调用方据空串跳过该行指针，不抛）
 */
export function buildReportPointer(kind: PointerKind, ref: string): string {
  if (!(POINTER_KINDS as readonly string[]).includes(kind)) {
    log.warn({ kind }, '未知指针种类 — 返回空指针（不编造种类，degraded）');
    return '';
  }
  const safeRef = typeof ref === 'string' ? ref.replace(/[\]\s]/g, '') : '';
  return `[src:${kind}:${safeRef}]`;
}

// ═══ 指针解析 ═══

/**
 * 从文本中提取全部指针（按出现顺序，**按原文去重**——同一物理引用重复出现只计一次）。
 *
 * @input  text 任意值（非字符串 → 空数组，静默；调用方用 resolvePointers 取 degraded 语义）
 * @output ReportPointer[]（kind 已窄化到白名单——正则本身只匹配白名单 kind）
 *
 * 模块私有：消费者是 `collectSlotLines`（覆盖/可读性审计）与 `resolvePointers`（解析审计），
 * 对外解析面统一走 `resolvePointers`（其内部即本函数）。
 */
function parsePointers(text: unknown): ReportPointer[] {
  if (typeof text !== 'string' || text.length === 0) return [];
  const out: ReportPointer[] = [];
  const seen = new Set<string>();
  const re = pointerRe();
  let m: RegExpExecArray | null = re.exec(text);
  while (m !== null) {
    const raw = m[0];
    if (!seen.has(raw)) {
      seen.add(raw);
      out.push({ kind: m[1] as PointerKind, ref: m[2], raw });
    }
    m = re.exec(text);
  }
  return out;
}

// ═══ 槽位行采集（覆盖审计 + 可读性审计共用单源解析） ═══

/** 槽位段内的一条 `- ` 条目行（标题行 / `**Top 3:**` / footer 不计入） */
export interface SlotLine {
  /** 所属槽位标题（ONEPAGER_SLOT_TITLES 之一） */
  slot: string;
  /** 条目正文（**不含** `- ` 前缀） */
  text: string;
  /** 是否含 ≥1 个可解析指针 */
  hasPointer: boolean;
  /** 是否为空态行（含 `[degraded]` 标记——R1 明文豁免） */
  isDegraded: boolean;
}

/**
 * 采集 markdown 中四槽位段的全部条目行（**解析单源**：覆盖审计与可读性审计共用，
 * 避免两处口径漂移）。
 *
 * @input  markdown 一页纸全文（非字符串 → 空数组）
 * @output SlotLine[]（按出现顺序）
 *
 * 段切分规则: 命中槽位标题即进入该槽位段；段内空行忽略；段内首个非 `- ` 开头的非空行
 * （`## 头行` / `**Top 3:**` / `📎 footer` / 其它标题）结束该段。
 */
export function collectSlotLines(markdown: unknown): SlotLine[] {
  if (typeof markdown !== 'string' || markdown.length === 0) return [];
  const out: SlotLine[] = [];
  let slot: string | null = null;
  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    if ((ONEPAGER_SLOT_TITLES as readonly string[]).includes(line)) {
      slot = line;
      continue;
    }
    if (line === '') continue;
    if (slot === null) continue;
    if (!line.startsWith('- ')) {
      slot = null;
      continue;
    }
    const text = line.slice(2);
    out.push({
      slot,
      text,
      hasPointer: parsePointers(text).length > 0,
      isDegraded: text.includes(DEGRADED_MARK),
    });
  }
  return out;
}

/** 剥离全部 `[src:...]` 指针——人类可见宽度口径（指针为审计元数据，非老板阅读面） */
export function stripPointers(text: unknown): string {
  if (typeof text !== 'string') return '';
  return text.replace(pointerRe(), '').replace(/\s+/g, ' ').trim();
}

/**
 * 覆盖审计（R1: 每条目行必带 ≥1 指针）——按槽位标题切段统计。
 *
 * @input  markdown 一页纸全文（非字符串 → degraded + 全 0）
 * @output ConclusionCoverage
 * @degraded 输入非字符串 → degraded:true + reason='input-not-string'（不抛）
 *
 * 计数口径（与 spec §5.3 conclusionLines 定义一致）:
 *   conclusionLines   = 四槽位段内的 `- ` 条目行，**排除**空态行（含 `[degraded]`，R1 豁免）
 *   linesWithPointer  = 上述行中含 ≥1 指针者
 *   missingPointerLines = 差值（R1 违规计数，必须为 0）
 */
export function auditConclusionCoverage(markdown: unknown): ConclusionCoverage {
  if (typeof markdown !== 'string') {
    return {
      conclusionLines: 0,
      linesWithPointer: 0,
      missingPointerLines: 0,
      degraded: true,
      reason: 'input-not-string',
    };
  }
  const tracked = collectSlotLines(markdown).filter(line => !line.isDegraded);
  const linesWithPointer = tracked.filter(line => line.hasPointer).length;
  return {
    conclusionLines: tracked.length,
    linesWithPointer,
    missingPointerLines: tracked.length - linesWithPointer,
    degraded: false,
  };
}

// ═══ 指针解析审计 ═══

/**
 * 解析审计（resolved / unresolved / unknown 三态）。
 *
 * @input  text markdown 文本；resolvers kind → 存在性判定（缺席的 kind 一律计 unknown）
 * @output PointerAudit
 * @degraded 输入非字符串 → degraded:true + reason='input-not-string'；
 *           任一指针落 unknown → degraded:true + reason（partial-resolvers-unavailable 等）
 *
 * 三态语义（铁律 24/31，防 fail-open）:
 *   resolved   = 解析器可用 **且** 目标记录存在
 *   unresolved = 解析器可用 **但** 目标不存在（编造/漂移指纹，必须为 0）
 *   unknown    = 解析器缺席/抛错（**"判不了" ≠ "判过了"**，不得计入 resolved）
 */
export function resolvePointers(
  text: unknown,
  resolvers: PointerResolvers | null | undefined,
): PointerAudit {
  if (typeof text !== 'string') {
    return {
      total: 0,
      resolvedCount: 0,
      unresolvedCount: 0,
      unknownCount: 0,
      externalResolvableCount: 0,
      degraded: true,
      reason: 'input-not-string',
      results: [],
    };
  }

  const pointers = parsePointers(text);
  const map: PointerResolvers = resolvers ?? {};
  const results: PointerResolution[] = [];
  let resolvedCount = 0;
  let unresolvedCount = 0;
  let unknownCount = 0;
  let externalResolvableCount = 0;

  for (const pointer of pointers) {
    const resolver = map[pointer.kind];
    if (typeof resolver !== 'function') {
      unknownCount++;
      results.push({
        pointer,
        state: 'unknown',
        detail: `无 ${pointer.kind} 解析器（判不了 ≠ 判过了，不计 resolved）`,
      });
      continue;
    }
    let exists: boolean;
    try {
      exists = resolver(pointer.kind, pointer.ref) === true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg, kind: pointer.kind, ref: pointer.ref }, '指针解析器抛错 — 计 unknown（degraded，不 fail-open）');
      unknownCount++;
      results.push({ pointer, state: 'unknown', detail: `解析器抛错: ${msg}` });
      continue;
    }
    if (exists) {
      resolvedCount++;
      // report 指针指向报告自身（#summary）；cycle/finding/evidence 指向报告之外的物理记录
      if (pointer.kind !== 'report') externalResolvableCount++;
      results.push({ pointer, state: 'resolved', detail: '目标物理记录存在' });
    } else {
      unresolvedCount++;
      results.push({ pointer, state: 'unresolved', detail: '目标物理记录不存在（编造/漂移指纹）' });
    }
  }

  const degraded = unknownCount > 0;
  return {
    total: pointers.length,
    resolvedCount,
    unresolvedCount,
    unknownCount,
    externalResolvableCount,
    degraded,
    ...(degraded ? { reason: 'partial-resolvers-unavailable' } : {}),
    results,
  };
}
