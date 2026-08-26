/**
 * stores/capability.ts — D538 左栏能力导航纯逻辑契约（L1，零 zustand/react/lucide 依赖）
 *
 * 本模块是"产品独有能力导航"的**纯逻辑**层：状态机切换、GA 权限门控、角标/状态灯色映射、
 * 能力标签。图标/React 组件映射留在组件层（LeftPanel/RightPanel），不混入此处，保证 node 可测。
 *
 * 契约（铁律 47，先于实现定义 — dev doc §5/§7.1）:
 *   @input  — current: SelectedCap, next: CapabilityId, role: string, stats: {criticalCount,warningCount}|null, status: string
 *   @output — bool / 颜色枚举 / 字符串标签 / null（隐藏）
 *   @degraded — 无（纯函数不 IO）；badgeColorFor 以 null 表示"降级 → 角标隐藏"
 *   @error   — 不抛（未知 status/role 用默认值兜底，fail-closed）
 */

/** 产品独有能力 id — 与 LeftPanel/RightPanel 的 data-cap 与详情分派一致 */
export type CapabilityId = 'reach' | 'loops' | 'action' | 'ga';

/** 当前选中的能力项；null = 默认（右栏显示默认三标签视图） */
export type SelectedCap = CapabilityId | null;

/** 全部 4 个能力 id（完整性 + 动态渲染枚举）。渲染 loops 数量用后端返回的 loops.length，勿硬编码。 */
export const CAPABILITY_IDS: readonly CapabilityId[] = ['reach', 'loops', 'action', 'ga'];

/**
 * toggleCap — 能力项点击状态机。
 * @input  current: 当前选中项（null 表示未选）
 * @output next: 点击目标项
 * @return 当前 === next → null（取消选中，右栏回默认）；否则 → next（选中/切换）
 * @degraded 无
 * @error 不抛
 */
export function toggleCap(current: SelectedCap, next: CapabilityId): SelectedCap {
  return current === next ? null : next;
}

/**
 * canAccessCap — GA 权限门控（fail-closed）。
 * @input  role: 用户角色字符串
 * @output cap: 目标能力
 * @return cap === 'ga' → role === 'ga' 才 true；其余能力对所有人 true
 * @degraded 无
 * @error 未知 role 访问 ga → false（拦截，fail-closed）
 */
export function canAccessCap(role: string, cap: CapabilityId): boolean {
  if (cap === 'ga') return role === 'ga';
  return true;
}

/** 能力项中文标签（渲染层使用，禁止显示裸 id） */
const CAPABILITY_LABELS: Record<CapabilityId, string> = {
  reach: '主动触达',
  loops: '五循环状态',
  action: 'Action 闭环',
  ga: 'GA 协同',
};

/**
 * capabilityLabel — 能力中文名。
 * @input  cap: 能力 id
 * @output 中文标签（非空字符串）
 * @degraded 无
 * @error 不抛（Label 表全量覆盖 CAPABILITY_IDS）
 */
export function capabilityLabel(cap: CapabilityId): string {
  return CAPABILITY_LABELS[cap];
}

/** 角标颜色：red（高优先）/ orange（关注）/ green（正常）/ null（降级→隐藏），对齐 --red/--orange/--green */
export type BadgeColor = 'red' | 'orange' | 'green' | null;

/**
 * badgeColorFor — 左栏角标颜色（含降级）。
 * @input  stats: { criticalCount, warningCount } | null（null = 接口降级/未加载）
 * @output 'red'|'orange'|'green'|null
 * @degraded stats === null → 返回 null（角标隐藏，不渲染假"0"计数）
 * @error 不抛
 */
export function badgeColorFor(stats: { criticalCount: number; warningCount: number } | null): BadgeColor {
  if (stats === null) return null;
  if (stats.criticalCount > 0) return 'red';
  if (stats.warningCount > 0) return 'orange';
  return 'green';
}

/** loop 状态灯颜色：green（完成）/ red（失败）/ orange（降级）/ grey（pending/未知，防御式兜底） */
export type LoopStatusColor = 'green' | 'red' | 'orange' | 'grey';

/**
 * loopStatusColor — loop 状态→状态灯色（防御式，未知兜底灰）。
 * @input  status: 后端 loop 的 status 值（'completed'|'failed'|'degraded'|'pending' 或未知）
 * @output 'green'|'red'|'orange'|'grey'
 * @degraded 未知枚举 → 'grey'（兜底，不抛，不渲染假绿）
 * @error 不抛
 */
export function loopStatusColor(status: string): LoopStatusColor {
  switch (status) {
    case 'completed': return 'green';
    case 'failed': return 'red';
    case 'degraded': return 'orange';
    case 'pending': return 'grey';
    default: return 'grey';
  }
}
