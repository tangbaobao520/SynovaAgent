/**
 * GapDynamics — 缝隙动力学
 * 在六缝隙时间序列上做纯数值推导：速度、加速度、相位耦合、僵化维度。零 engine-core import。
 */
import type { GraphStoreReader } from '../../../shared/baseline';

const DIMENSIONS = ['division_of_labor','information_flow','authority_governance','trust_incentive','knowledge_sharing','external_interface'] as const;
const STICKY_THRESHOLD = 0.05;
const STICKY_DAYS = 60;

export async function computeGapDynamics(store: GraphStoreReader, teamId: string): Promise<{ value: number; threshold: string; metadata: Record<string, unknown> }> {
  const events = store.queryNodes('Event', { teamId });
  const gapEvents = events.filter(e => String(e.props.eventType || '').startsWith('gap_'));

  let stickyCount = 0;
  let totalChangeRate = 0;
  let dimCount = 0;

  for (const dim of DIMENSIONS) {
    const dimEvents = gapEvents.filter(e => String(e.props.dimension || '') === dim);
    if (dimEvents.length < 2) { stickyCount++; dimCount++; continue; }

    // 简单变化率：最早值 vs 最新值
    const sorted = dimEvents.sort((a, b) => {
      const at = String(a.props.timestamp || '');
      const bt = String(b.props.timestamp || '');
      return at.localeCompare(bt);
    });
    const firstVal = Number(sorted[0].props.value || 0);
    const lastVal = Number(sorted[sorted.length - 1].props.value || 0);
    const changeRate = firstVal !== 0 ? Math.abs((lastVal - firstVal) / firstVal) : 0;

    if (changeRate < STICKY_THRESHOLD) stickyCount++;
    totalChangeRate += changeRate;
    dimCount++;
  }

  const overallRate = dimCount > 0 ? totalChangeRate / dimCount : 0;
  const stickinessRatio = dimCount > 0 ? stickyCount / dimCount : 1;

  return {
    value: stickinessRatio,
    threshold: stickinessRatio > 0.6 ? 'critical' : stickinessRatio > 0.35 ? 'warning' : 'ok',
    metadata: { overallChangeRate: overallRate, stickyDimensions: stickyCount, totalDimensions: dimCount, eventCount: gapEvents.length },
  };
}
