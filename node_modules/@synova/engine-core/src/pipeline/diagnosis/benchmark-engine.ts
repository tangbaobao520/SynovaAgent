/**
 * diagnosis/benchmark-engine.ts — 跨团队基准对比引擎 (SOG v1.0 扩展)
 *
 * 将当前团队的诊断数据与所有同组织其他团队对比，计算百分位排名。
 * 纯统计计算，零 LLM 调用。
 *
 * P2 — FDE 引擎内化
 * SOG v1.0: 扩展新维度（目标对齐度、能力覆盖度、风险指数、合规覆盖度）
 */

import type { GapDimension, GapSnapshot, DimensionBenchmark, BenchmarkReport } from './types';
import { loadAllTimelines } from './persistence';
import { GAP_DIMENSIONS } from './gap-recorder';
import { getEngineContext } from '../../engine-context';

const MIN_PEER_COUNT = 3;

/** SOG v1.0 扩展维度（可选，缺数据时标注"无基线"） */
const SOG_V1_DIMENSIONS = [
  'goal_alignment',
  'capability_coverage',
  'risk_index',
  'compliance_coverage',
] as const;

/** SOG v1.0 扩展维度的中文标签 */
const SOG_V1_LABELS: Record<string, string> = {
  goal_alignment: '目标对齐度',
  capability_coverage: '能力覆盖度',
  risk_index: '风险指数',
  compliance_coverage: '合规覆盖度',
};

/** SOG v1.0: Optional metrics for new dimensions */
export interface SogV1BenchmarkInput {
  goalAlignmentIndex?: number;
  capabilityCoverage?: number;
  riskIndex?: number;
  complianceCoverage?: number;
}

/**
 * Compute cross-team benchmark for a single team.
 * Returns null if fewer than MIN_PEER_COUNT comparable teams exist.
 *
 * @param teamId - Target team identifier
 * @param sogV1Metrics - Optional SOG v1.0 new dimension scores
 */
export function computeBenchmark(
  teamId: string,
  sogV1Metrics?: SogV1BenchmarkInput,
): BenchmarkReport | null {
  const log = getEngineContext().logger;
  const degradedModules: string[] = [];

  const allTimelines = loadAllTimelines();
  const allTeamIds = [...allTimelines.keys()];

  if (allTeamIds.length < MIN_PEER_COUNT + 1) {
    log.info('[benchmark] 可比团队不足 %d（当前 %d），跳过基准计算', MIN_PEER_COUNT + 1, allTeamIds.length);
    return null;
  }

  // Get latest snapshot for each team
  const peerScores = new Map<string, Record<string, number>>();
  for (const tid of allTeamIds) {
    const snapshots = allTimelines.get(tid);
    if (!snapshots || snapshots.length === 0) continue;
    const latest = snapshots[snapshots.length - 1];
    const scores: Record<string, number> = {};
    for (const dim of GAP_DIMENSIONS) {
      const gap = latest.gaps[dim as GapDimension];
      if (gap && typeof gap.engineScore === 'number') {
        scores[dim] = gap.engineScore;
      }
    }
    if (Object.keys(scores).length > 0) {
      peerScores.set(tid, scores);
    }
  }

  const targetScores = peerScores.get(teamId);
  if (!targetScores) {
    log.info('[benchmark] 目标团队 %s 无快照数据，跳过', teamId);
    return null;
  }

  const peerIds = [...peerScores.keys()].filter(id => id !== teamId);
  if (peerIds.length < MIN_PEER_COUNT) {
    log.info('[benchmark] 可比团队不足 %d（排除自身后 %d），跳过基准计算', MIN_PEER_COUNT, peerIds.length);
    return null;
  }

  const dimensions: Record<string, DimensionBenchmark> = {};
  const dimensionPercentiles: number[] = [];

  for (const dim of GAP_DIMENSIONS) {
    const dimScores: number[] = [];
    for (const pid of peerIds) {
      const scores = peerScores.get(pid);
      if (scores && typeof scores[dim] === 'number') {
        dimScores.push(scores[dim]);
      }
    }

    if (dimScores.length < MIN_PEER_COUNT) continue;

    const teamScore = targetScores[dim] ?? 0;
    const sorted = [...dimScores].sort((a, b) => a - b);
    const n = sorted.length;

    // Percentile: fraction of peers scored BELOW the target team
    const countBelow = sorted.filter(s => s < teamScore).length;
    const percentile = Math.round((countBelow / n) * 100);
    const rank = sorted.filter(s => s > teamScore).length + 1;

    // Mean + median
    const sum = sorted.reduce((a, b) => a + b, 0);
    const avg = sum / n;
    const median = n % 2 === 0
      ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
      : sorted[Math.floor(n / 2)];

    // Top quartile threshold (75th percentile)
    const topQIdx = Math.ceil(n * 0.75) - 1;
    const topQuartileThreshold = sorted[Math.max(0, Math.min(topQIdx, n - 1))];

    dimensions[dim] = {
      dimension: dim,
      teamScore,
      peerAvg: Math.round(avg * 1000) / 1000,
      peerMedian: Math.round(median * 1000) / 1000,
      topQuartileThreshold: Math.round(topQuartileThreshold * 1000) / 1000,
      percentile,
      rank,
      totalPeers: n,
      interpretation: buildInterpretation(dim, percentile, rank, n),
    };

    dimensionPercentiles.push(percentile);
  }

  // ── SOG v1.0 新维度：缺数据时标注"无基线" ──
  if (sogV1Metrics) {
    const sogV1Map: Record<string, number | undefined> = {
      goal_alignment: sogV1Metrics.goalAlignmentIndex,
      capability_coverage: sogV1Metrics.capabilityCoverage,
      risk_index: sogV1Metrics.riskIndex,
      compliance_coverage: sogV1Metrics.complianceCoverage,
    };

    for (const dim of SOG_V1_DIMENSIONS) {
      const score = sogV1Map[dim];
      const dimLabel = SOG_V1_LABELS[dim] ?? dim;

      if (typeof score === 'number' && score >= 0) {
        // Normalize raw score (0-1) to percentile range (0-100)
        const clampedScore = Math.round(Math.min(Math.max(score, 0), 1) * 1000) / 1000;
        const normalizedPct = Math.round(clampedScore * 100);

        // No peer data for SOG v1.0 dimensions — use team's own score as fallback reference
        dimensions[dim] = {
          dimension: dim,
          teamScore: clampedScore,
          peerAvg: clampedScore,
          peerMedian: clampedScore,
          topQuartileThreshold: clampedScore,
          percentile: normalizedPct,
          rank: 0,
          totalPeers: 0,
          interpretation: `${dimLabel}: ${normalizedPct}% (SOG v1.0 新维度，暂无同类基准数据——无基线)`,
        };

        // Include in overall percentile calculation
        dimensionPercentiles.push(normalizedPct);
      } else {
        // Data missing — mark as "no baseline" but do NOT affect overall percentile
        dimensions[dim] = {
          dimension: dim,
          teamScore: 0,
          peerAvg: 0,
          peerMedian: 0,
          topQuartileThreshold: 0,
          percentile: 0,
          rank: 0,
          totalPeers: 0,
          interpretation: `${dimLabel}: 数据未采集，无基线`,
        };
      }
    }
  }

  const overallPercentile = dimensionPercentiles.length > 0
    ? Math.round(dimensionPercentiles.reduce((a, b) => a + b, 0) / dimensionPercentiles.length)
    : 50;

  return {
    teamId,
    generatedAt: new Date().toISOString(),
    dimensions,
    overallPercentile,
    overallInterpretation: buildOverallInterpretation(overallPercentile, peerIds.length),
    peerCount: peerIds.length,
    degradedModules,
  };
}

// ── Interpretation builders ──

function buildInterpretation(dim: string, percentile: number, rank: number, total: number): string {
  const dimLabel = DIMENSION_LABELS[dim] ?? dim;
  if (percentile >= 90) return `${dimLabel}表现优秀，高于 ${percentile}% 的同类团队`;
  if (percentile >= 75) return `${dimLabel}表现良好，高于 ${percentile}% 的同类团队`;
  if (percentile >= 50) return `${dimLabel}处于中游，高于 ${percentile}% 的同类团队`;
  if (percentile >= 25) return `${dimLabel}有待改善，仅高于 ${percentile}% 的同类团队（排名 ${rank}/${total}）`;
  return `${dimLabel}需要重点关注，仅高于 ${percentile}% 的同类团队（排名 ${rank}/${total}）`;
}

function buildOverallInterpretation(percentile: number, peerCount: number): string {
  if (percentile >= 80) return `团队整体协作健康度处于前 ${100 - percentile}%，在 ${peerCount} 个可比团队中表现优秀。`;
  if (percentile >= 50) return `团队整体协作健康度处于中上水平，超过 ${percentile}% 的可比团队。`;
  return `团队整体协作健康度低于 ${percentile}% 的可比团队，存在系统性改善空间。`;
}

const DIMENSION_LABELS: Record<string, string> = {
  division_of_labor: '分工明确度',
  information_flow: '信息流动性',
  authority_gradient: '权限梯度',
  trust_incentive: '信任与激励',
  knowledge_sharing: '知识共享',
  external_interface: '外部接口',
};
