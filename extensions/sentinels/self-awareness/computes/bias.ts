/** SelfAwareness — 组织自知偏差。比较自评与引擎观测的差距。差距本身就是信号。零engine-core import。 */
import type { GraphStoreReader } from '../../../shared/baseline';

const SIGNIFICANT_GAP = 0.2;

export async function computeSelfAwareness(store: GraphStoreReader, teamId: string): Promise<{ value: number; threshold: string; metadata: Record<string, unknown> }> {
  // 查询GOAL节点：progress(引擎观测) vs selfScore(团队自评)
  const goals = store.queryNodes('Goal', { teamId });
  if (goals.length === 0) return { value: 0, threshold: 'ok', metadata: { gaps: 0 } };

  let totalGap = 0;
  let gapCount = 0;
  const deltas: Array<{ goal: string; observed: number; self: number; delta: number }> = [];

  for (const g of goals) {
    const observed = Number(g.props.progress || 0);
    const selfScore = Number(g.props.selfScore || observed); // 无自评时用观测值
    const delta = Math.abs(observed - selfScore);
    if (delta >= SIGNIFICANT_GAP) gapCount++;
    totalGap += delta;
    deltas.push({ goal: String(g.props.name || g.id).slice(0, 20), observed, self: selfScore, delta });
  }

  const avgDelta = goals.length > 0 ? totalGap / goals.length : 0;
  const gapRatio = goals.length > 0 ? gapCount / goals.length : 0;

  return {
    value: avgDelta,
    threshold: gapRatio > 0.5 ? 'critical' : gapRatio > 0.25 ? 'warning' : 'ok',
    metadata: { avgDelta, gapRatio, gapCount, totalGoals: goals.length, deltas: deltas.slice(0, 5) },
  };
}
