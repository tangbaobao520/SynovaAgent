/**
 * agent/cycle-conclusion-service.ts — 各维度循环结论派生（L2，D791）
 *
 * 一句话: 把既有「溢出仪表盘」的每循环一行，转成一页纸 S3 槽位可渲染的结论行 + 溯源指针。
 *
 * 契约:
 *   @input  — orgId: string（企业/组织 id）；store: unknown（注入的 GraphStore 句柄，可 null/undefined）；
 *             registry?: CycleRegistryLike（默认全局 cycleRegistry 单例，测试可注入）
 *   @output — { lines: CycleConclusionLine[]; registeredCount: number; degraded: boolean; reason?: string }
 *   @degraded — store 缺席/非图存储 → 每注册循环一条「未建立基线」行（hasSnapshot:false +
 *               `[degraded]` 标记）+ degraded:true + reason='store-unavailable' + log.warn；
 *               无已注册循环 → lines=[] + reason='no-registered-cycles'；
 *               orgId 非法 → lines=[] + reason='invalid-org-id'；
 *               加载/查询异常 → degraded:true + reason='cycle-conclusion-error' + log.warn
 *   @error  — 本函数**永不抛出**（whole-body catch；调用方 = L1 报告渲染路径，不因循环数据失败而 500）
 *
 * 零新指标（DS8 硬约束）: 行文案**只拼接**既有 `DashboardRow` 字段
 * （cycleName / currentOverflow / unit / trendArrow / trendDirection / maturityLabel）；
 * 不计算任何新比率/评分/阈值，不把 `hasOverflow`（dashboard 既有 50% 启发式）包装成新指标名。
 * `trendDirection` 中文化（rising→上升 / stable→持平 / declining→下降）为**展示映射**，非新指标。
 *
 * 架构（铁律 39）: L2 → cycles（先例 src/agent/cycle-snapshot-service.ts:13、agent/loop-handlers.ts:36）。
 * GraphStore 全量接口单源声明于 l4/graph-bridge.ts（check-architecture 禁第二处声明）——
 * 本文件用 `type GraphStoreLike = import('../l4/graph-bridge').GraphStore;` 类型位置形态
 * （类型位置 import 形态——不写 l4 相对路径的静态 import 语句，L2→L4 硬门豁免；先例 src/agent/loop-handlers.ts:670），
 * 仅做边界一次 cast。
 */
import { createLogger } from '@synova/logger';
import { cycleRegistry } from '../cycles/cycle-registry';
import { registerLoadedCycles } from '../cycles/cycle-loader';
import { generateOverflowDashboard, type DashboardRow } from '../cycles/overflow-dashboard';
import { getLatestSnapshot, getCycleSnapshots } from '../cycles/overflow-graph-bridge';
import { buildReportPointer, DEGRADED_MARK, type PointerResolver } from './report-onepager-trace';

const log = createLogger('agent/cycle-conclusion-service');

/** bridge 只消费 GraphStore 的 queryNodes 子集；全量接口单源声明于 l4/graph-bridge.ts（禁止第二处声明） */
type GraphStoreLike = import('../l4/graph-bridge').GraphStore;

/** registry 消费面 = 既有 CycleRegistry 类（测试注入 `new CycleRegistry()` 实例即可，零假类型） */
type CycleRegistryLike = import('../cycles/cycle-registry').CycleRegistry;

/** 循环配置（registry.list() 元素类型） */
type CycleConfigLike = import('../cycles/cycle-types').CycleConfig;

export interface CycleConclusionLine {
  cycleId: string;
  cycleName: string;
  /** 条目**正文**（不含 `- ` 前缀——模板统一加 bullet；含溯源指针）。S3 槽位直接消费 */
  text: string;
  pointer: string;
  hasSnapshot: boolean;
}

export interface CycleConclusions {
  lines: CycleConclusionLine[];
  registeredCount: number;
  degraded: boolean;
  reason?: string;
}

/** trendDirection 中文化（展示映射，非新指标；spec §5.4） */
const TREND_DIRECTION_LABELS: Readonly<Record<DashboardRow['trendDirection'], string>> = {
  rising: '上升',
  stable: '持平',
  declining: '下降',
};

/**
 * 无快照行文案（R2 降级显式: 不得渲染正面结论措辞；R3 不编造: 无数值、无趋势箭头）。
 * 模块私有（对外只暴露 `buildCycleConclusions` / `buildCyclePointerResolver`）——
 * pre-commit 组 4 接线审计要求 export 有 src/ 跨文件消费者。
 */
const NO_BASELINE_TEXT = '未建立基线（无快照数据）';

/** 文案中「溢出」标签后的数值就绪判据: 有快照才输出数值（无快照恒不输出，R3） */
function hasSnapshotFor(cycleId: string, snapshotMonths: ReadonlyMap<string, string>): boolean {
  return snapshotMonths.has(cycleId);
}

/**
 * GraphStore 结构守卫（零 `as any`——铁律 38 内联类型断言形态）。
 * 只用 queryNodes 一个原语做存在性判据（overflow-graph-bridge 的读路径仅依赖它）。
 */
function isGraphStoreLike(value: unknown): value is GraphStoreLike {
  if (typeof value !== 'object' || value === null) return false;
  return typeof (value as { queryNodes?: unknown }).queryNodes === 'function';
}

/**
 * 纯映射: `OverflowDashboard.rows` → 一页纸 S3 结论行。
 *
 * 契约:
 *   @input  — rows: DashboardRow[]（`generateOverflowDashboard` 产物，已按「负溢出优先」排序）；
 *             snapshotMonths: ReadonlyMap<cycleId, 'YYYY-MM'>（该循环最新快照月；缺席 = 无快照）
 *   @output — CycleConclusionLine[]（与 rows 同序、同长度——排序语义完全交给 dashboard，不重排）
 *   @degraded — 无快照的循环 → `NO_BASELINE_TEXT` + `[degraded]` + `@none` 指针（不编造数值/趋势）
 *
 * 行文案（spec §5.4 固定格式）:
 *   有快照（模板渲染后）: `- <循环名>：溢出 <currentOverflow><unit>｜<trendArrow> <方向中文>｜<maturityLabel> [src:cycle:<id>@<YYYY-MM>]`
 *   无快照（模板渲染后）: `- <循环名>：未建立基线（无快照数据）[degraded] [src:cycle:<id>@none]`
 */
function mapDashboardRows(
  rows: DashboardRow[],
  snapshotMonths: ReadonlyMap<string, string>,
): CycleConclusionLine[] {
  return rows.map((row) => {
    const month = snapshotMonths.get(row.cycleId);
    const pointer = buildReportPointer('cycle', `${row.cycleId}@${month ?? 'none'}`);
    if (month === undefined || !hasSnapshotFor(row.cycleId, snapshotMonths)) {
      return {
        cycleId: row.cycleId,
        cycleName: row.cycleName,
        hasSnapshot: false,
        pointer,
        text: `${row.cycleName}：${NO_BASELINE_TEXT}${DEGRADED_MARK} ${pointer}`,
      };
    }
    const direction = TREND_DIRECTION_LABELS[row.trendDirection] ?? row.trendDirection;
    return {
      cycleId: row.cycleId,
      cycleName: row.cycleName,
      hasSnapshot: true,
      pointer,
      text: `${row.cycleName}：溢出 ${row.currentOverflow}${row.unit}｜${row.trendArrow} ${direction}｜${row.maturityLabel} ${pointer}`,
    };
  });
}

/** 无快照行的批量构造（store 缺席时的诚实降级路径——仍按 registry 驱动，不硬编码维度表） */
function noBaselineLines(cycles: CycleConfigLike[]): CycleConclusionLine[] {
  return cycles.map((cycle) => {
    const pointer = buildReportPointer('cycle', `${cycle.cycleId}@none`);
    return {
      cycleId: cycle.cycleId,
      cycleName: cycle.name,
      hasSnapshot: false,
      pointer,
      text: `${cycle.name}：${NO_BASELINE_TEXT}${DEGRADED_MARK} ${pointer}`,
    };
  });
}

/**
 * 派生组织级「各维度循环结论」（3-7 的数据来源）。
 *
 * 派生链（全部复用既有生产函数，零新算法/零新阈值）:
 *   cycleRegistry.list()  ← registerLoadedCycles()（registry 空时自加载，与 agent/loop-handlers.ts:621-626 同语义）
 *     ↓
 *   generateOverflowDashboard(orgId, cycleRegistry, store)             ← src/cycles/overflow-dashboard.ts:95（既有）
 *     ↓ rows[]（已按负溢出优先排序 :147-151）
 *   getLatestSnapshot(orgId, cycleId, store) 逐循环取最新快照月（仅用于「有无快照」+ 指针月份；
 *     不重算任何溢出量——overflow 数值全部来自 dashboard rows）
 *     ↓
 *   mapDashboardRows(rows, months) → CycleConclusionLine[]            ← 纯映射
 *
 * @input  orgId 组织/企业 id；store GraphStore 句柄（可 null）；registry 可选注入
 * @output CycleConclusions（lines / registeredCount / degraded / reason）
 * @degraded 见文件头契约（store 缺席、无注册循环、orgId 非法、查询异常四条路径均为显式降级）
 */
export async function buildCycleConclusions(
  orgId: string,
  store: unknown,
  registry: CycleRegistryLike = cycleRegistry,
): Promise<CycleConclusions> {
  try {
    if (typeof orgId !== 'string' || orgId.trim() === '') {
      log.warn({ orgId }, 'orgId 非法 — 循环结论降级（lines=[]，reason=invalid-org-id）');
      return { lines: [], registeredCount: 0, degraded: true, reason: 'invalid-org-id' };
    }

    // registry 空时自加载（既有生产语义；加载失败不抛——registerLoadedCycles 内部逐条吞错并返回 errors）
    if (registry.list().length === 0) {
      const loaded = await registerLoadedCycles();
      if (loaded.errors.length > 0) {
        log.warn({ errors: loaded.errors.length }, '循环加载存在错误 — 已注册部分继续（degraded 留痕）');
      }
    }

    const cycles = registry.list();
    if (cycles.length === 0) {
      log.warn({ orgId }, '无已注册循环 — S3 槽位降级（reason=no-registered-cycles）');
      return { lines: [], registeredCount: 0, degraded: true, reason: 'no-registered-cycles' };
    }

    if (!isGraphStoreLike(store)) {
      log.warn(
        { orgId, registeredCount: cycles.length },
        'GraphStore 缺席/非图存储 — 循环结论全量降级为「未建立基线」（不编造数值，铁律 24/31）',
      );
      return {
        lines: noBaselineLines(cycles),
        registeredCount: cycles.length,
        degraded: true,
        reason: 'store-unavailable',
      };
    }

    const dashboard = generateOverflowDashboard(orgId, registry, store);
    const snapshotMonths = new Map<string, string>();
    for (const cycle of cycles) {
      const latest = getLatestSnapshot(orgId, cycle.cycleId, store);
      if (latest && typeof latest.month === 'string' && latest.month !== '') {
        snapshotMonths.set(cycle.cycleId, latest.month);
      }
    }

    const lines = mapDashboardRows(dashboard.rows, snapshotMonths);
    if (dashboard.degraded) {
      log.warn({ orgId }, '溢出仪表盘返回 degraded — 循环结论按已得行渲染（降级传播，铁律 31）');
    }
    return {
      lines,
      registeredCount: cycles.length,
      degraded: dashboard.degraded,
      ...(dashboard.degraded ? { reason: 'dashboard-degraded' } : {}),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ err: msg, orgId }, '循环结论派生失败 — degraded（一页纸 S3 槽位走 [degraded] 空态行）');
    return { lines: [], registeredCount: 0, degraded: true, reason: 'cycle-conclusion-error' };
  }
}

/**
 * D791: 循环指针解析器工厂（`resolvePointers` 注入用——S3 指针的外部可溯源判据）。
 *
 * 契约:
 *   @input  orgId 企业 id；store GraphStore 句柄（可 null）
 *   @output PointerResolver | null —— `<cycleId>@none` → 该循环**确实无快照**才 true；
 *           `<cycleId>@YYYY-MM` → 该月快照存在才 true；store 缺席/非图存储 → **null**
 *           （调用方据此不下发该 kind 解析器 → 指针计 unknown，"判不了" ≠ "判过了"，铁律 24/31）
 *   @degraded store 缺席 → null + log.warn（绝不返回恒 true 的假解析器）
 *
 * 查询按 cycleId 缓存（一次 GET /report 内最多 N 次图查询，非 N×指针数）。
 */
export function buildCyclePointerResolver(orgId: string, store: unknown): PointerResolver | null {
  if (!isGraphStoreLike(store)) {
    log.warn({ orgId }, 'GraphStore 缺席 — 不下发 cycle 解析器（该 kind 计 unknown，不 fail-open）');
    return null;
  }
  const cache = new Map<string, string[]>();
  const monthsOf = (cycleId: string): string[] => {
    const hit = cache.get(cycleId);
    if (hit !== undefined) return hit;
    const months = getCycleSnapshots(orgId, cycleId, store).map(s => s.month);
    cache.set(cycleId, months);
    return months;
  };
  return (_kind, ref) => {
    const at = ref.lastIndexOf('@');
    if (at <= 0) return false; // 语法非法（无 @ / cycleId 为空）→ unresolved，不静默通过
    const cycleId = ref.slice(0, at);
    const month = ref.slice(at + 1);
    const months = monthsOf(cycleId);
    if (month === 'none') return months.length === 0; // 「无快照」声明须可验证，不无条件放行
    return months.includes(month);
  };
}
