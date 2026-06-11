/**
 * diagnosis/gap-dynamics.ts — 衍生计算层
 *
 * 在六缝隙时间序列上做纯数值推导。
 * 依赖：gap-recorder 的 timeline ≥ 3 个快照。
 * 实现方式：纯算术——diff、线性回归斜率、皮尔逊互相关、方差。零 LLM 调用。
 *
 * 关键解释：
 *   velocity > 0 = 该缝隙正在变化（如信息透明度在提升）
 *   velocity < 0 = 该缝隙正在退化
 *   phaseCoupling = 哪个缝隙总是先变、哪个缝隙后变——反映团队的反应链结构
 *   stickyDimensions = 超过阈值时间无显著变化——可能是"稳定锚点"或"僵化信号"
 */

import type { GapDynamics, PhaseCoupling, StickyDimension } from './types';
import type { GapDimension } from '../schema-bridge';
import { getGapTimeline } from './gap-recorder';

// ====================================================================
// Constants
// ====================================================================

/** Minimum snapshots required for dynamics computation */
const MIN_SNAPSHOTS = 3;

/** Threshold: change < this is considered "no significant change" */
const STICKY_THRESHOLD = 0.05;

/** Days threshold: unchanged for this many days → sticky */
const STICKY_DAYS_THRESHOLD = 60;

/** Significant correlation threshold for phase coupling */
const COUPLING_CORRELATION_THRESHOLD = 0.6;

// ====================================================================
// Public API
// ====================================================================

/**
 * Compute dynamics from the gap timeline for a team.
 * Returns null if < 3 snapshots available.
 */
export function computeDynamics(teamId: string): GapDynamics | null {
  const snapshots = getGapTimeline(teamId);
  if (snapshots.length < MIN_SNAPSHOTS) return null;

  // Sort by time ascending
  const sorted = [...snapshots].sort(
    (a, b) => new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime(),
  );

  const dimensions = extractDimensions(sorted);
  const velocity = computeVelocity(sorted, dimensions);
  const acceleration = computeAcceleration(sorted, dimensions);
  const phaseCoupling = computePhaseCoupling(sorted, dimensions);
  const stickyDimensions = computeStickyDimensions(sorted, dimensions);
  const overallChangeRate = computeOverallChangeRate(velocity);

  return {
    velocity,
    acceleration,
    phaseCoupling,
    stickyDimensions,
    overallChangeRate,
  };
}

// ====================================================================
// Internal: extract dimension list from snapshots
// ====================================================================

function extractDimensions(snapshots: Array<{ gaps: Record<string, { engineScore: number }> }>): GapDimension[] {
  const firstGaps = snapshots[0]?.gaps;
  if (!firstGaps) return [];
  return Object.keys(firstGaps) as GapDimension[];
}

// ====================================================================
// Internal: velocity = Δscore / Δtime (normalized)
// ====================================================================

function computeVelocity(
  snapshots: Array<{ observedAt: string; gaps: Record<string, { engineScore: number }> }>,
  dimensions: GapDimension[],
): Record<GapDimension, number> {
  const result = {} as Record<GapDimension, number>;

  for (const dim of dimensions) {
    const first = snapshots[0].gaps[dim]?.engineScore ?? 0;
    const last = snapshots[snapshots.length - 1].gaps[dim]?.engineScore ?? 0;
    const firstTime = new Date(snapshots[0].observedAt).getTime();
    const lastTime = new Date(snapshots[snapshots.length - 1].observedAt).getTime();
    const deltaDays = (lastTime - firstTime) / (1000 * 60 * 60 * 24);

    if (deltaDays <= 0) {
      result[dim] = 0;
    } else {
      // Normalize: score change per 30 days
      result[dim] = ((last - first) / deltaDays) * 30;
    }
  }

  return result;
}

// ====================================================================
// Internal: acceleration = Δvelocity / Δtime
// ====================================================================

function computeAcceleration(
  snapshots: Array<{ observedAt: string; gaps: Record<string, { engineScore: number }> }>,
  dimensions: GapDimension[],
): Record<GapDimension, number> {
  const result = {} as Record<GapDimension, number>;

  for (const dim of dimensions) {
    if (snapshots.length < 3) {
      result[dim] = 0;
      continue;
    }

    // Use the three most recent snapshots for acceleration
    const recent = snapshots.slice(-3);
    const t0 = new Date(recent[0].observedAt).getTime();
    const t1 = new Date(recent[1].observedAt).getTime();
    const t2 = new Date(recent[2].observedAt).getTime();

    const s0 = recent[0].gaps[dim]?.engineScore ?? 0;
    const s1 = recent[1].gaps[dim]?.engineScore ?? 0;
    const s2 = recent[2].gaps[dim]?.engineScore ?? 0;

    const dt1 = (t1 - t0) / (1000 * 60 * 60 * 24);
    const dt2 = (t2 - t1) / (1000 * 60 * 60 * 24);

    if (dt1 <= 0 || dt2 <= 0) {
      result[dim] = 0;
      continue;
    }

    const v1 = (s1 - s0) / dt1;
    const v2 = (s2 - s1) / dt2;
    const avgDt = (dt1 + dt2) / 2;

    result[dim] = ((v2 - v1) / avgDt) * 30; // normalized per 30 days
  }

  return result;
}

// ====================================================================
// Internal: phase coupling via Pearson cross-correlation
// ====================================================================

function computePhaseCoupling(
  snapshots: Array<{ observedAt: string; gaps: Record<string, { engineScore: number }> }>,
  dimensions: GapDimension[],
): PhaseCoupling[] {
  const couplings: PhaseCoupling[] = [];
  const n = snapshots.length;

  // Extract score series for each dimension
  const series: Record<string, number[]> = {};
  for (const dim of dimensions) {
    series[dim] = snapshots.map((s) => s.gaps[dim]?.engineScore ?? 0);
  }

  // Pairwise cross-correlation with lag 0 and lag 1
  for (const leader of dimensions) {
    for (const follower of dimensions) {
      if (leader === follower) continue;

      const leaderSeries = series[leader];
      const followerSeries = series[follower];

      // Compute Pearson r with lag 0
      const r0 = pearsonCorrelation(leaderSeries, followerSeries);

      // Compute Pearson r with lag 1 (leader leads follower by 1)
      if (n > 3) {
        const leaderShifted = leaderSeries.slice(0, -1);
        const followerShifted = followerSeries.slice(1);
        const r1 = pearsonCorrelation(leaderShifted, followerShifted);

        if (r1 > COUPLING_CORRELATION_THRESHOLD && r1 > r0) {
          const avgInterval = computeAvgSnapshotInterval(snapshots);
          couplings.push({
            leader,
            follower,
            lagDays: Math.round(avgInterval),
            correlation: Math.round(r1 * 100) / 100,
          });
        }
      }
    }
  }

  // Sort by correlation descending, deduplicate
  return couplings
    .sort((a, b) => b.correlation - a.correlation)
    .slice(0, 5);
}

// ====================================================================
// Internal: sticky dimensions — unchanged over threshold
// ====================================================================

function computeStickyDimensions(
  snapshots: Array<{ observedAt: string; gaps: Record<string, { engineScore: number }> }>,
  dimensions: GapDimension[],
): StickyDimension[] {
  const result: StickyDimension[] = [];
  const firstTime = new Date(snapshots[0].observedAt).getTime();
  const lastTime = new Date(snapshots[snapshots.length - 1].observedAt).getTime();
  const totalDays = (lastTime - firstTime) / (1000 * 60 * 60 * 24);

  for (const dim of dimensions) {
    const scores = snapshots.map((s) => s.gaps[dim]?.engineScore ?? 0);
    const variance = computeVariance(scores);

    if (variance < STICKY_THRESHOLD) {
      const monthsUnchanged = Math.round(totalDays / 30);
      result.push({
        dimension: dim,
        stickinessScore: Math.round((1 - variance / STICKY_THRESHOLD) * 100) / 100,
        monthsUnchanged,
      });
    }
  }

  return result;
}

// ====================================================================
// Internal: overall change rate
// ====================================================================

function computeOverallChangeRate(velocity: Record<GapDimension, number>): number {
  const absVelocities = Object.values(velocity).map(Math.abs);
  if (absVelocities.length === 0) return 0;
  return absVelocities.reduce((a, b) => a + b, 0) / absVelocities.length;
}

// ====================================================================
// Math helpers
// ====================================================================

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;

  const sumX = x.slice(0, n).reduce((a, b) => a + b, 0);
  const sumY = y.slice(0, n).reduce((a, b) => a + b, 0);
  const sumXY = x.slice(0, n).reduce((acc, xi, i) => acc + xi * y[i], 0);
  const sumX2 = x.slice(0, n).reduce((a, b) => a + b * b, 0);
  const sumY2 = y.slice(0, n).reduce((a, b) => a + b * b, 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt(
    (n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY),
  );

  if (denominator === 0) return 0;
  return numerator / denominator;
}

function computeVariance(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map((v) => (v - mean) ** 2);
  return squaredDiffs.reduce((a, b) => a + b, 0) / (values.length - 1);
}

function computeAvgSnapshotInterval(
  snapshots: Array<{ observedAt: string }>,
): number {
  if (snapshots.length < 2) return 0;
  const first = new Date(snapshots[0].observedAt).getTime();
  const last = new Date(snapshots[snapshots.length - 1].observedAt).getTime();
  return (last - first) / (1000 * 60 * 60 * 24) / (snapshots.length - 1);
}
