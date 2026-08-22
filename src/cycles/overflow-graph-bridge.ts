/**
 * src/cycles/overflow-graph-bridge.ts — OverflowGraphBridge
 *
 * 消费 GraphStore 读写溢出快照数据。
 * 复用 l4/graph-bridge.ts 的 GraphStore 接口。
 *
 * 契约:
 *   @input  — enterpriseId + cycleId + GraphStore（依赖注入）
 *   @output — OverflowSnapshot[] / OverflowHeatmap / void
 *   @degraded — GraphStore 不可用时返回空数据，不崩溃
 */
import { createLogger } from '@synova/logger';
import type { GraphStore } from '../l4/graph-bridge';
import type { OverflowSnapshot } from './overflow-compute';

const log = createLogger('cycles/overflow-graph-bridge');

// ═══ Types ═══

export interface OverflowHeatmapQuery {
  /** 起始月份（YYYY-MM） */
  fromMonth?: string;
  /** 截止月份（YYYY-MM） */
  toMonth?: string;
  /** 限定循环列表（空=全部循环） */
  cycleIds?: string[];
}

export interface OverflowCell {
  cycleId: string;
  month: string;
  value: number;
  trendDirection: 'rising' | 'stable' | 'declining';
  maturity: string;
}

export interface OverflowHeatmap {
  enterpriseId: string;
  fromMonth: string;
  toMonth: string;
  cells: OverflowCell[];
  degraded: boolean;
}

// ═══ GraphBridge ═══

const SNAPSHOT_NODE_TYPE = 'OVERFLOW_SNAPSHOT';

/**
 * 租户图派生 — `${enterpriseId}:cycles`（D338 fail-closed）。
 * 替代原全局图 'overflow_snapshots'：快照按企业作用域隔离，绝不回落全局命名空间。
 */
function snapshotGraph(enterpriseId: string): string {
  return `${enterpriseId}:cycles`;
}

/**
 * 将溢出快照写入 GraphStore。
 *
 * @param enterpriseId - 企业 ID
 * @param cycleId - 循环 ID
 * @param snapshot - 溢出快照数据
 * @param store - GraphStore 实例
 */
export function writeOverflowSnapshot(
  enterpriseId: string,
  cycleId: string,
  snapshot: OverflowSnapshot,
  store: GraphStore,
): void {
  try {
    const nodeId = `${enterpriseId}:${cycleId}:${snapshot.month}`;
    store.createNode(SNAPSHOT_NODE_TYPE, {
      id: nodeId,
      enterpriseId,
      ...snapshot,
    } as unknown as Record<string, unknown>, snapshotGraph(enterpriseId));
    log.info({ nodeId, cycleId }, '溢出快照已写入');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ err: msg, enterpriseId, cycleId }, '溢出快照写入失败 — 降级');
  }
}

/**
 * 获取指定企业/循环的溢出快照列表。
 *
 * @param enterpriseId - 企业 ID
 * @param cycleId - 循环 ID
 * @param store - GraphStore 实例
 * @param opts - 可选的时间范围限制
 * @returns 快照列表（按月份倒序）
 */
export function getCycleSnapshots(
  enterpriseId: string,
  cycleId: string,
  store: GraphStore,
  opts?: { fromMonth?: string; toMonth?: string; limit?: number },
): OverflowSnapshot[] {
  try {
    const nodes = store.queryNodes(SNAPSHOT_NODE_TYPE, {
      enterpriseId,
      cycleId,
    } as Record<string, unknown>, snapshotGraph(enterpriseId));

    let snapshots = nodes.map(n => n.props as unknown as OverflowSnapshot);

    // 时间过滤
    if (opts?.fromMonth) {
      snapshots = snapshots.filter(s => s.month >= opts.fromMonth!);
    }
    if (opts?.toMonth) {
      snapshots = snapshots.filter(s => s.month <= opts.toMonth!);
    }

    // 按月份倒序
    snapshots.sort((a, b) => b.month.localeCompare(a.month));

    if (opts?.limit && opts.limit > 0) {
      snapshots = snapshots.slice(0, opts.limit);
    }

    return snapshots;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ err: msg, enterpriseId, cycleId }, '获取溢出快照失败 — 降级');
    return [];
  }
}

/**
 * 获取指定企业/循环的最新溢出快照。
 *
 * @returns 最新快照，不存在时返回 null
 */
export function getLatestSnapshot(
  enterpriseId: string,
  cycleId: string,
  store: GraphStore,
): OverflowSnapshot | null {
  const snapshots = getCycleSnapshots(enterpriseId, cycleId, store, { limit: 1 });
  return snapshots.length > 0 ? snapshots[0] : null;
}

/**
 * 获取溢出热力图（企业级概览）。
 *
 * @param enterpriseId - 企业 ID
 * @param store - GraphStore 实例
 * @param opts - 查询选项
 * @returns 热力图数据
 */
export function getOverflowHeatmap(
  enterpriseId: string,
  store: GraphStore,
  opts?: OverflowHeatmapQuery,
): OverflowHeatmap {
  try {
    const allNodes = store.queryNodes(SNAPSHOT_NODE_TYPE, {
      enterpriseId,
    } as Record<string, unknown>, snapshotGraph(enterpriseId));

    let snapshots = allNodes.map(n => n.props as unknown as OverflowSnapshot);

    // 按循环 ID 过滤
    if (opts?.cycleIds && opts.cycleIds.length > 0) {
      snapshots = snapshots.filter(s => opts.cycleIds!.includes(s.cycleId));
    }

    // 时间范围
    const months = [...new Set(snapshots.map(s => s.month))].sort();
    const fromMonth = opts?.fromMonth || months[0] || '';
    const toMonth = opts?.toMonth || months[months.length - 1] || '';

    // 构建热力图单元
    const cells: OverflowCell[] = snapshots.map(s => ({
      cycleId: s.cycleId,
      month: s.month,
      value: s.overflowValue,
      trendDirection: s.trendDirection,
      maturity: s.maturity,
    }));

    return {
      enterpriseId,
      fromMonth,
      toMonth,
      cells,
      degraded: false,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ err: msg, enterpriseId }, '获取溢出热力图失败 — 降级');
    return { enterpriseId, fromMonth: '', toMonth: '', cells: [], degraded: true };
  }
}
