/**
 * extensions/sentinels/shared/baseline.ts — 基线计算工具
 *
 * 所有哨兵共享的基线对比函数。
 * 通过 L4 GraphStore 接口获取历史数据，不直接查 SQLite。
 *
 * V3.7 Batch 2
 */

/** GraphStore 查询接口 — 哨兵只需要查询能力 */
export interface GraphStoreReader {
  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{
    id: string;
    type: string;
    props: Record<string, unknown>;
  }>;
  queryEdges(type?: string, from?: string, to?: string, graph?: string): Array<{
    id: string;
    type: string;
    from: string;
    to: string;
    weight: number;
    props: Record<string, unknown>;
  }>;
}

/**
 * 计算变化率：当前值相对于基线值的变化百分比。
 * @returns 变化率，如 0.05 表示增长 5%，-0.03 表示下降 3%
 */
export function changeRate(current: number, baseline: number): number {
  if (baseline === 0) return current > 0 ? 1 : current < 0 ? -1 : 0;
  return (current - baseline) / Math.abs(baseline);
}

/**
 * 判断指标是否触发阈值。
 */
export function evaluateThreshold(
  value: number,
  threshold: { warning: number; critical: number },
  direction: 'higher_is_worse' | 'lower_is_worse' = 'lower_is_worse',
): 'ok' | 'warning' | 'critical' {
  if (direction === 'lower_is_worse') {
    if (value <= threshold.critical) return 'critical';
    if (value <= threshold.warning) return 'warning';
    return 'ok';
  } else {
    if (value >= threshold.critical) return 'critical';
    if (value >= threshold.warning) return 'warning';
    return 'ok';
  }
}

/**
 * 从 FINANCIAL 节点提取数值属性。
 */
export function getFinancialValue(
  store: GraphStoreReader,
  financialType: string,
  field: string,
  teamId: string,
): number | null {
  const nodes = store.queryNodes('FINANCIAL', { financialType, teamId });
  if (nodes.length === 0) return null;
  const value = nodes[0].props[field];
  if (typeof value === 'number') return value;
  return null;
}
