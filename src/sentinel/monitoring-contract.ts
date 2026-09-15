/**
 * src/sentinel/monitoring-contract.ts — D716 监测契约（状态驱动通知的配置面）
 *
 * 每客户一份契约文件（数据目录, 与 synova.db 同目录）: 阈值/渠道/节奏/格式/升级规则/责任人。
 * schema 单一事实源 = SYNOVA-IMPL-DSH-D716-D1-monitoring-contract-20260913.md §5.2-A（Mac/Win 均不得自行扩展字段）。
 * 产品语义 = DECISION-D1-状态驱动通知模型-20260912.md（创始人裁定, 六态 + 四条政策值）。
 *
 * 政策默认值（D-1 §三-4）: 周报 1 次/一页纸; 24h 未回应提醒一次; 7 天无进展进周报首页; 不处理项每周回顾。
 *
 * 架构: L3 洞察层（哨兵引擎配置输入）+ L5 邻接文件 I/O（运行时数据目录, 与 services/llm-credential-store.ts 同型先例）。
 */
import { readFileSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { createLogger } from '@synova/logger';
import { loadConfig } from '../config';
import { listNotificationChannels } from '../notifications/registry';

const log = createLogger('sentinel/monitoring-contract');

// ═══ Types（schema 类型单源 — types.ts 不再另定义, 避免双源） ═══
// 值域形态: as const 值列表 + typeof 派生 — 类型与运行时校验集共享单一事实源。
// 注: 这些是契约 schema 值域（spec §5.2-A 字段字典; 跨线同步 §三裁决: schema 单源 = spec 文档,
// Mac/Win 均不得自行扩展）, 非本体类型（文件驱动的对象是 extensions/ontology/ 本体, 不适用）。

/** 节奏值域（D-1 政策值 3: 默认 weekly） */
const CADENCE_VALUES = ['daily', 'weekly', 'monthly'] as const;
export type Cadence = typeof CADENCE_VALUES[number];

/** 汇报格式值域（默认 one_pager = 一页纸; 渲染器已存在 report-assembler.ts） */
const FORMAT_VALUES = ['one_pager', 'short_text', 'full_report'] as const;
export type ReportFormat = typeof FORMAT_VALUES[number];

/** 责任人角色值域（与 escalation-rules.json 同族词汇, 不造第二套） */
const OWNER_ROLE_VALUES = ['owner', 'ga', 'department_head', 'liaison'] as const;
export type OwnerRole = typeof OWNER_ROLE_VALUES[number];

/** 升级接收人角色值域 */
const ESCALATE_TARGET_VALUES = ['owner', 'department_head', 'liaison'] as const;
export type EscalateTarget = typeof ESCALATE_TARGET_VALUES[number];

/** 升级规则（三字段齐 — 合并后必完整） */
export interface ContractEscalation {
  remind_after_hours: number;
  front_page_after_days: number;
  escalate_to: EscalateTarget;
}

/** defaults 合并后形态（全字段必填 — 默认已填, 下游不再判空） */
export interface ContractDefaults {
  cadence: Cadence;
  format: ReportFormat;
  channels: string[];
  escalation: ContractEscalation;
  dismissed_review: 'weekly';
}

/** metrics[] 单条目（原始可选形态; 合并在 contractForSentinel 完成） */
export interface ContractMetricEntry {
  sentinel_id: string;
  /** manifest.thresholds 的键; 缺省 = 该哨兵首个键 */
  metric?: string;
  /** 客户级阈值覆盖（resolveThresholds 优先级最高层） */
  thresholds?: { warning: number; critical: number };
  channels?: string[];
  cadence?: Cadence;
  format?: ReportFormat;
  /** 字段级覆盖 defaults.escalation（部分字段可） */
  escalation?: Partial<ContractEscalation>;
  owner?: OwnerRole;
  note?: string;
}

/** loader 输出（三层合并: 内置默认 > 契约文件字段） */
export interface EffectiveContract {
  org_id: string;
  source: 'file' | 'defaults';
  degraded: boolean;
  degradedReasons: string[];
  defaults: ContractDefaults;
  /** 键 = 哨兵 bareId（sentinel- 前缀已剥离, 口径同 resolveThresholds） */
  bySentinel: Map<string, ContractMetricEntry>;
}

/** 单哨兵有效契约（全字段必填 — thresholds/owner 语义上可缺省） */
export interface ResolvedContract {
  thresholds?: { warning: number; critical: number };
  channels: string[];
  cadence: Cadence;
  format: ReportFormat;
  escalation: ContractEscalation;
  owner: OwnerRole | null;
}

/** deps 注入缝（测试确定性 + 不碰真实 data/; 先例: resolveThresholds memoryStore 缝） */
export interface LoadMonitoringContractDeps {
  /** 缺省 = dirname(loadConfig().dbPath)（与 synova.db 同目录 — 打包态 Electron userData 注入唯一可写处） */
  dataDir?: string;
  readFile?: (p: string) => string;
  /** 返回 null = ENOENT（正常缺省）; 抛错 = IO 异常（降级） */
  statMtimeMs?: (p: string) => number | null;
  orgId?: string;
  /** 合法渠道集（缺省 = listNotificationChannels() ∪ 内置 {'electron','weekly_report'}） */
  availableChannels?: () => string[];
}

// ═══ 常量（D-1 政策值 + 枚举集 — 校验集从值域单源派生） ═══

/** 契约文件名（实例路径 = <dirname(config.dbPath)>/monitoring-contract.json） */
const MONITORING_CONTRACT_FILENAME = 'monitoring-contract.json';

const POLICY_DEFAULTS: ContractDefaults = {
  cadence: 'weekly',
  format: 'one_pager',
  channels: ['electron'],
  escalation: { remind_after_hours: 24, front_page_after_days: 7, escalate_to: 'owner' },
  dismissed_review: 'weekly',
};

const CADENCES: ReadonlySet<string> = new Set<string>(CADENCE_VALUES);
const FORMATS: ReadonlySet<string> = new Set<string>(FORMAT_VALUES);
const OWNER_ROLES: ReadonlySet<string> = new Set<string>(OWNER_ROLE_VALUES);
const ESCALATE_TARGETS: ReadonlySet<string> = new Set<string>(ESCALATE_TARGET_VALUES);
const UPDATED_BY_VALUES: ReadonlySet<string> = new Set(['boss', 'ga', 'system']);

const REMIND_HOURS_MIN = 1;
const REMIND_HOURS_MAX = 720;
const FRONT_PAGE_DAYS_MIN = 1;
const FRONT_PAGE_DAYS_MAX = 365;

// ═══ Cache（mtime 记忆化 — 键 = dataDir|orgId, 文件未变复用解析结果） ═══

interface CacheEntry { mtimeMs: number; value: EffectiveContract; }
const cache = new Map<string, CacheEntry>();

/** 清空契约缓存（测试隔离 / 热更新入口; spec §5.2-C @cache） */
export function clearMonitoringContractCache(): void {
  cache.clear();
}

// ═══ 内部工具 ═══

function cloneDefaults(): ContractDefaults {
  return {
    ...POLICY_DEFAULTS,
    channels: [...POLICY_DEFAULTS.channels],
    escalation: { ...POLICY_DEFAULTS.escalation },
  };
}

function defaultsResult(orgId: string, source: 'file' | 'defaults', reasons: string[]): EffectiveContract {
  return { org_id: orgId, source, degraded: reasons.length > 0, degradedReasons: reasons, defaults: cloneDefaults(), bySentinel: new Map() };
}

/** bareId: sentinel- 前缀剥离（口径同 resolveThresholds 调用方 L1209） */
function bareId(sentinelId: string): string {
  return sentinelId.replace(/^sentinel-/, '');
}

/** 合法渠道集 = 注入 ∪ 注册表 ∪ 内置兜底（'electron' 为默认渠道必恒合法; 'weekly_report' 为周期报告虚渠道） */
function availableChannelSet(deps?: LoadMonitoringContractDeps): ReadonlySet<string> {
  let listed: string[] = [];
  if (deps?.availableChannels) {
    listed = deps.availableChannels();
  } else {
    try {
      listed = listNotificationChannels();
    } catch (err: unknown) {
      log.warn({ err: err instanceof Error ? err.message : String(err) }, '[monitoring-contract] 渠道注册表读取失败 — 仅内置渠道合法（degraded）');
    }
  }
  return new Set([...listed, 'electron', 'weekly_report']);
}

function isPositiveIntIn(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
}

// 值域类型守卫（Set.has 不窄化 — 显式守卫替代 as, 铁律 38）
function isCadence(v: unknown): v is Cadence {
  return typeof v === 'string' && CADENCES.has(v);
}
function isReportFormat(v: unknown): v is ReportFormat {
  return typeof v === 'string' && FORMATS.has(v);
}
function isOwnerRole(v: unknown): v is OwnerRole {
  return typeof v === 'string' && OWNER_ROLES.has(v);
}
function isEscalateTarget(v: unknown): v is EscalateTarget {
  return typeof v === 'string' && ESCALATE_TARGETS.has(v);
}

/** 渠道数组校验: 全元素合法字符串 → 采纳; 任一非法 → 整字段丢弃（保守一致） */
function validChannels(v: unknown, allowed: ReadonlySet<string>): string[] | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  const out: string[] = [];
  for (const ch of v) {
    if (typeof ch !== 'string' || !allowed.has(ch)) return null;
    out.push(ch);
  }
  return out;
}

/** 阈值对象校验: warning/critical 均有限数值 → 采纳; 否则 null */
function validThresholds(v: unknown): { warning: number; critical: number } | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  const w = o.warning;
  const c = o.critical;
  if (typeof w !== 'number' || !Number.isFinite(w) || typeof c !== 'number' || !Number.isFinite(c)) return null;
  return { warning: w, critical: c };
}

/** escalation 字段级校验/合并（base 完整, patch 部分合法字段覆盖; 非法字段记 reason 丢弃） */
function mergeEscalation(
  base: ContractEscalation,
  patch: unknown,
  fieldPrefix: string,
  reasons: string[],
): ContractEscalation {
  if (typeof patch !== 'object' || patch === null) return base;
  const p = patch as Record<string, unknown>;
  const merged: ContractEscalation = { ...base };
  if (p.remind_after_hours !== undefined) {
    if (isPositiveIntIn(p.remind_after_hours, REMIND_HOURS_MIN, REMIND_HOURS_MAX)) {
      merged.remind_after_hours = p.remind_after_hours;
    } else {
      reasons.push(`${fieldPrefix}.remind_after_hours`);
      log.warn({ field: `${fieldPrefix}.remind_after_hours`, value: p.remind_after_hours }, '[monitoring-contract] remind_after_hours 非法（需正整数 1-720）— 字段丢弃');
    }
  }
  if (p.front_page_after_days !== undefined) {
    if (isPositiveIntIn(p.front_page_after_days, FRONT_PAGE_DAYS_MIN, FRONT_PAGE_DAYS_MAX)) {
      merged.front_page_after_days = p.front_page_after_days;
    } else {
      reasons.push(`${fieldPrefix}.front_page_after_days`);
      log.warn({ field: `${fieldPrefix}.front_page_after_days`, value: p.front_page_after_days }, '[monitoring-contract] front_page_after_days 非法（需正整数 1-365）— 字段丢弃');
    }
  }
  if (p.escalate_to !== undefined) {
    if (isEscalateTarget(p.escalate_to)) {
      merged.escalate_to = p.escalate_to;
    } else {
      reasons.push(`${fieldPrefix}.escalate_to`);
      log.warn({ field: `${fieldPrefix}.escalate_to`, value: p.escalate_to }, '[monitoring-contract] escalate_to 非法 — 字段丢弃');
    }
  }
  return merged;
}

// ═══ 解析 + 校验（三层合并核心） ═══

function parseAndValidate(raw: string, orgId: string, allowed: ReadonlySet<string>): EffectiveContract {
  // ── 整文件守卫（parse / 版本 / org）: 任一失败 → 忽略整文件, 全用默认 ──
  let file: unknown;
  try {
    file = JSON.parse(raw);
  } catch (err: unknown) {
    log.warn({ err: err instanceof Error ? err.message : String(err) }, '[monitoring-contract] JSON.parse 失败 — 整文件忽略, 用默认（degraded）');
    return defaultsResult(orgId, 'defaults', ['parse_failed']);
  }
  if (typeof file !== 'object' || file === null || Array.isArray(file)) {
    log.warn('[monitoring-contract] 契约根非对象 — 整文件忽略, 用默认（degraded）');
    return defaultsResult(orgId, 'defaults', ['parse_failed']);
  }
  const f = file as Record<string, unknown>;

  if (f.schema_version !== 1) {
    log.warn({ schema_version: f.schema_version }, '[monitoring-contract] schema_version 非 1 — 整文件忽略, 用默认（degraded）');
    return defaultsResult(orgId, 'defaults', ['schema_version_invalid']);
  }
  if (typeof f.org_id !== 'string' || f.org_id !== orgId) {
    log.warn({ fileOrgId: f.org_id, instanceOrgId: orgId }, '[monitoring-contract] org_id 不匹配 — 整文件忽略（防串客户, degraded）');
    return defaultsResult(orgId, 'defaults', ['org_id_mismatch']);
  }

  // ── 通过守卫: source='file', 字段级校验（非法丢字段, 其余生效） ──
  const reasons: string[] = [];

  // 元字段（审计用, 不致命; 缺失/非法 → 记 reason + warn）
  if (typeof f.updated_at !== 'string' || Number.isNaN(Date.parse(f.updated_at))) {
    reasons.push('updated_at');
    log.warn({ updated_at: f.updated_at }, '[monitoring-contract] updated_at 缺失或非法 ISO8601 — 字段丢弃');
  }
  if (typeof f.updated_by !== 'string' || !UPDATED_BY_VALUES.has(f.updated_by)) {
    reasons.push('updated_by');
    log.warn({ updated_by: f.updated_by }, '[monitoring-contract] updated_by 缺失或未知值 — 字段丢弃');
  }

  // defaults 合并
  const defaults = cloneDefaults();
  if (f.defaults !== undefined) {
    if (typeof f.defaults === 'object' && f.defaults !== null && !Array.isArray(f.defaults)) {
      const d = f.defaults as Record<string, unknown>;
      if (d.cadence !== undefined) {
        if (isCadence(d.cadence)) defaults.cadence = d.cadence;
        else {
          reasons.push('defaults.cadence');
          log.warn({ cadence: d.cadence }, '[monitoring-contract] defaults.cadence 非法 — 字段丢弃');
        }
      }
      if (d.format !== undefined) {
        if (isReportFormat(d.format)) defaults.format = d.format;
        else {
          reasons.push('defaults.format');
          log.warn({ format: d.format }, '[monitoring-contract] defaults.format 非法 — 字段丢弃');
        }
      }
      if (d.channels !== undefined) {
        const ch = validChannels(d.channels, allowed);
        if (ch) defaults.channels = ch;
        else {
          reasons.push('defaults.channels');
          log.warn({ channels: d.channels, allowed: [...allowed] }, '[monitoring-contract] defaults.channels 含未注册渠道或非法 — 字段丢弃');
        }
      }
      if (d.escalation !== undefined) {
        defaults.escalation = mergeEscalation(defaults.escalation, d.escalation, 'defaults.escalation', reasons);
      }
      if (d.dismissed_review !== undefined) {
        if (d.dismissed_review === 'weekly') defaults.dismissed_review = 'weekly';
        else {
          reasons.push('defaults.dismissed_review');
          log.warn({ dismissed_review: d.dismissed_review }, '[monitoring-contract] dismissed_review 非法（仅 weekly）— 字段丢弃');
        }
      }
    } else {
      reasons.push('defaults');
      log.warn('[monitoring-contract] defaults 非对象 — 字段丢弃');
    }
  }

  // metrics 合并
  const bySentinel = new Map<string, ContractMetricEntry>();
  if (f.metrics !== undefined) {
    if (Array.isArray(f.metrics)) {
      for (let i = 0; i < f.metrics.length; i++) {
        const m = f.metrics[i];
        if (typeof m !== 'object' || m === null || Array.isArray(m)) {
          reasons.push(`metrics[${i}]`);
          log.warn({ index: i }, '[monitoring-contract] metrics 条目非对象 — 条目丢弃');
          continue;
        }
        const mo = m as Record<string, unknown>;
        if (typeof mo.sentinel_id !== 'string' || mo.sentinel_id === '') {
          reasons.push(`metrics[${i}].sentinel_id`);
          log.warn({ index: i }, '[monitoring-contract] metrics[].sentinel_id 缺失或非法 — 条目丢弃');
          continue;
        }
        const entry: ContractMetricEntry = { sentinel_id: mo.sentinel_id };
        if (mo.metric !== undefined) {
          if (typeof mo.metric === 'string' && mo.metric !== '') entry.metric = mo.metric;
          else {
            reasons.push(`metrics[${i}].metric`);
            log.warn({ index: i }, '[monitoring-contract] metrics[].metric 非法 — 字段丢弃');
          }
        }
        if (mo.thresholds !== undefined) {
          const th = validThresholds(mo.thresholds);
          if (th) entry.thresholds = th;
          else {
            reasons.push(`metrics[${i}].thresholds`);
            log.warn({ index: i }, '[monitoring-contract] metrics[].thresholds 非法（需有限数值 warning/critical）— 字段丢弃');
          }
        }
        if (mo.channels !== undefined) {
          const ch = validChannels(mo.channels, allowed);
          if (ch) entry.channels = ch;
          else {
            reasons.push(`metrics[${i}].channels`);
            log.warn({ index: i, channels: mo.channels }, '[monitoring-contract] metrics[].channels 含未注册渠道或非法 — 字段丢弃');
          }
        }
        if (mo.cadence !== undefined) {
          if (isCadence(mo.cadence)) entry.cadence = mo.cadence;
          else {
            reasons.push(`metrics[${i}].cadence`);
            log.warn({ index: i, cadence: mo.cadence }, '[monitoring-contract] metrics[].cadence 非法 — 字段丢弃');
          }
        }
        if (mo.format !== undefined) {
          if (isReportFormat(mo.format)) entry.format = mo.format;
          else {
            reasons.push(`metrics[${i}].format`);
            log.warn({ index: i, format: mo.format }, '[monitoring-contract] metrics[].format 非法 — 字段丢弃');
          }
        }
        if (mo.escalation !== undefined) {
          const esc = mergeEscalation(defaults.escalation, mo.escalation, `metrics[${i}].escalation`, reasons);
          // 与 defaults 的差异即为有效覆盖（部分字段）
          const patch: Partial<ContractEscalation> = {};
          if (esc.remind_after_hours !== defaults.escalation.remind_after_hours) patch.remind_after_hours = esc.remind_after_hours;
          if (esc.front_page_after_days !== defaults.escalation.front_page_after_days) patch.front_page_after_days = esc.front_page_after_days;
          if (esc.escalate_to !== defaults.escalation.escalate_to) patch.escalate_to = esc.escalate_to;
          if (Object.keys(patch).length > 0) entry.escalation = patch;
        }
        if (mo.owner !== undefined) {
          if (isOwnerRole(mo.owner)) entry.owner = mo.owner;
          else {
            reasons.push(`metrics[${i}].owner`);
            log.warn({ index: i, owner: mo.owner }, '[monitoring-contract] metrics[].owner 非法 — 字段丢弃');
          }
        }
        if (typeof mo.note === 'string') entry.note = mo.note;
        bySentinel.set(bareId(mo.sentinel_id), entry);
      }
    } else {
      reasons.push('metrics');
      log.warn('[monitoring-contract] metrics 非数组 — 字段丢弃');
    }
  }

  return { org_id: orgId, source: 'file', degraded: reasons.length > 0, degradedReasons: reasons, defaults, bySentinel };
}

// ═══ 公开 API ═══

/**
 * loadMonitoringContract — 监测契约读取 + 校验 + 三层合并（内置默认 > 契约文件）
 * 契约:
 *   @input  — deps?: { dataDir?; readFile?; statMtimeMs?; orgId?; availableChannels? }
 *             缺省: dataDir = dirname(loadConfig().dbPath)（与 synova.db 同目录, 打包态 Electron userData 唯一可写处）;
 *                   orgId = loadConfig().orgId; 真实 fs 读; 渠道集 = 注册表 ∪ 内置
 *   @output — EffectiveContract { org_id; source: 'file'|'defaults'; degraded; degradedReasons;
 *             defaults: 全字段必填（默认已填）; bySentinel: 已合并哨兵级条目（bareId 键） }
 *   @degraded — ENOENT → 正常缺省（不告警, degraded=false, source='defaults'）;
 *               JSON.parse 失败 / schema_version 非 1 / org_id 不匹配 → log.warn + degraded=true + 整文件忽略（全用默认）;
 *               单字段非法（类型/枚举/越界/渠道未注册）→ log.warn + degraded=true + 丢弃该字段（其余生效）, degradedReasons 列字段路径
 *   @error  — 不抛（所有失败路径降级返回, 铁律 24/31）
 *   @cache  — 键 = (dataDir, orgId, mtimeMs); 文件未变 → 复用上次解析结果; clearMonitoringContractCache() 供测试/热更新
 */
export function loadMonitoringContract(deps?: LoadMonitoringContractDeps): EffectiveContract {
  const dataDir = deps?.dataDir ?? dirname(loadConfig().dbPath);
  const orgId = deps?.orgId ?? loadConfig().orgId;
  const filePath = join(dataDir, MONITORING_CONTRACT_FILENAME);
  const cacheKey = `${dataDir}|${orgId}`;

  let mtimeMs: number | null;
  if (deps?.statMtimeMs) {
    mtimeMs = deps.statMtimeMs(filePath);
  } else {
    try {
      mtimeMs = statSync(filePath).mtimeMs;
    } catch {
      mtimeMs = null; // ENOENT / stat 失败 → 正常缺省
    }
  }

  if (mtimeMs === null) {
    return defaultsResult(orgId, 'defaults', []);
  }

  const hit = cache.get(cacheKey);
  if (hit && hit.mtimeMs === mtimeMs) return hit.value;

  let raw: string;
  if (deps?.readFile) {
    try {
      raw = deps.readFile(filePath);
    } catch (err: unknown) {
      log.warn({ err: err instanceof Error ? err.message : String(err), filePath }, '[monitoring-contract] 契约文件读取失败 — 用默认（degraded）');
      return defaultsResult(orgId, 'defaults', ['read_failed']);
    }
  } else {
    try {
      raw = readFileSync(filePath, 'utf-8');
    } catch (err: unknown) {
      log.warn({ err: err instanceof Error ? err.message : String(err), filePath }, '[monitoring-contract] 契约文件读取失败 — 用默认（degraded）');
      return defaultsResult(orgId, 'defaults', ['read_failed']);
    }
  }

  const value = parseAndValidate(raw, orgId, availableChannelSet(deps));
  cache.set(cacheKey, { mtimeMs, value });
  return value;
}

/**
 * contractForSentinel — 取某哨兵的有效契约（三层合并终点）
 * 契约:
 *   @input  — c: loadMonitoringContract 输出; sentinelId: 哨兵 id（'sentinel-' 前缀自动剥离, 口径同 resolveThresholds）
 *   @output — ResolvedContract（全字段必填 — channels/cadence/format/escalation 继承 defaults, thresholds/owner 可缺省）
 *   @degraded — 无（纯合并, 上游 degraded 由调用方传播）
 *   @error  — 不抛
 */
export function contractForSentinel(c: EffectiveContract, sentinelId: string): ResolvedContract {
  const entry = c.bySentinel.get(bareId(sentinelId));
  const escalation: ContractEscalation = { ...c.defaults.escalation };
  if (entry?.escalation) {
    if (entry.escalation.remind_after_hours !== undefined) escalation.remind_after_hours = entry.escalation.remind_after_hours;
    if (entry.escalation.front_page_after_days !== undefined) escalation.front_page_after_days = entry.escalation.front_page_after_days;
    if (entry.escalation.escalate_to !== undefined) escalation.escalate_to = entry.escalation.escalate_to;
  }
  return {
    thresholds: entry?.thresholds,
    channels: entry?.channels ?? c.defaults.channels,
    cadence: entry?.cadence ?? c.defaults.cadence,
    format: entry?.format ?? c.defaults.format,
    escalation,
    owner: entry?.owner ?? null,
  };
}
