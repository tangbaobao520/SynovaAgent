/**
 * diagnosis/self-awareness.ts — 自知偏差计算
 *
 * 收集人对各缝隙维度的自我评估，与引擎观测做差值。
 *
 * 原则：
 *   引擎不假设人的自评比引擎更准。引擎报告两个值之间的差距。
 *   差距本身就是最有信息量的信号。
 *
 * 自评数据采集（前端配合）：
 *   POST /api/diagnosis/:teamId/self-assess  { dimension, score }
 *
 * 时机：引擎诊断输出后，工作台呈现时嵌入内联选择
 * 成本：一个 click，不是量表
 * 隐私："只用于校准引擎，不对团队公开"
 */

import type { SelfAwarenessReport, SelfAwarenessDelta, SelfAssessmentRecord } from './types';
import type { GapDimension } from '../schema-bridge';
import { getLatestSnapshot } from './gap-recorder';
import { saveSelfAssessment, loadSelfAssessments } from './persistence';

// ====================================================================
// In-memory store: self-assessment records per team
// ====================================================================

const selfAssessments = new Map<string, SelfAssessmentRecord[]>();

// ====================================================================
// Startup recovery: load persisted data into memory
// ====================================================================

function recoverTeamIfNeeded(teamId: string): void {
  if (selfAssessments.has(teamId)) return;
  const data = loadSelfAssessments(teamId);
  if (data.length > 0) {
    selfAssessments.set(teamId, data);
  }
}

// ====================================================================
// Constants
// ====================================================================

/** |delta| > this is considered "significant" */
const SIGNIFICANT_DELTA_THRESHOLD = 0.2;

// ====================================================================
// Public API — data ingestion
// ====================================================================

/**
 * Record a self-assessment from a team member.
 * Called by the POST /api/diagnosis/:teamId/self-assess endpoint.
 */
export function recordSelfAssessment(
  teamId: string,
  dimension: GapDimension,
  score: number,
): SelfAssessmentRecord {
  const record: SelfAssessmentRecord = {
    teamId,
    dimension,
    score: Math.max(0, Math.min(1, score)), // clamp 0-1
    recordedAt: new Date().toISOString(),
  };

  recoverTeamIfNeeded(teamId);
  if (!selfAssessments.has(teamId)) {
    selfAssessments.set(teamId, []);
  }
  selfAssessments.get(teamId)!.push(record);

  saveSelfAssessment(record);
  return record;
}

/**
 * Get all self-assessment records for a team.
 */
export function getSelfAssessments(teamId: string): SelfAssessmentRecord[] {
  return [...(selfAssessments.get(teamId) ?? [])];
}

/**
 * Clear all self-assessments for a team.
 */
export function clearTeamSelfAssessments(teamId: string): boolean {
  return selfAssessments.delete(teamId);
}

// ====================================================================
// Public API — computation
// ====================================================================

/**
 * Compute self-awareness report: engine observation vs human self-assessment.
 *
 * Compares the latest engine snapshot scores against the average of human
 * self-assessment scores for each dimension.
 *
 * Returns a report even if no self-assessments exist (all deltas will be null).
 */
export function computeSelfAwareness(teamId: string): SelfAwarenessReport {
  const snapshot = getLatestSnapshot(teamId);
  const assessments = selfAssessments.get(teamId) ?? [];

  // If no snapshot, return empty report
  if (!snapshot) {
    return {
      deltas: [],
      overallGap: 0,
      significantDimensions: [],
      interpretation: '引擎尚未产生快照，无法计算自知偏差',
    };
  }

  const dims = Object.keys(snapshot.gaps) as GapDimension[];
  const deltas: SelfAwarenessDelta[] = [];

  for (const dim of dims) {
    const engineScore = snapshot.gaps[dim]?.engineScore ?? 0;
    const dimAssessments = assessments.filter((a) => a.dimension === dim);

    let humanScore: number | null = null;
    let sampleCount = 0;

    if (dimAssessments.length > 0) {
      // Average of all self-assessments for this dimension
      humanScore =
        dimAssessments.reduce((sum, a) => sum + a.score, 0) / dimAssessments.length;
      sampleCount = dimAssessments.length;
    }

    const delta = humanScore !== null ? humanScore - engineScore : null;

    deltas.push({
      dimension: dim,
      engineScore,
      humanScore,
      sampleCount,
      delta,
      interpretation: interpretDelta(dim, delta, engineScore, humanScore, sampleCount),
    });
  }

  const validDeltas = deltas.filter((d) => d.delta !== null);
  const overallGap =
    validDeltas.length > 0
      ? validDeltas.reduce((sum, d) => sum + Math.abs(d.delta!), 0) / validDeltas.length
      : 0;

  const significantDeltas = deltas.filter(
    (d) => d.delta !== null && Math.abs(d.delta) > SIGNIFICANT_DELTA_THRESHOLD,
  );

  return {
    deltas,
    overallGap: Math.round(overallGap * 100) / 100,
    significantDimensions: significantDeltas,
    interpretation: buildOverallInterpretation(overallGap, significantDeltas, deltas),
  };
}

// ====================================================================
// Internal: interpretation builders
// ====================================================================

const DIM_LABELS: Record<string, string> = {
  division_of_labor: '分工方式',
  information_flow: '信息流动',
  authority_governance: '权限治理',
  trust_incentive: '信任与激励',
  knowledge_sharing: '知识共享',
  external_interface: '对外接口',
};

function interpretDelta(
  dim: GapDimension,
  delta: number | null,
  engineScore: number,
  humanScore: number | null,
  sampleCount: number,
): string {
  const label = DIM_LABELS[dim] ?? dim;

  if (delta === null || humanScore === null) {
    return `${label}：引擎观测 ${engineScore.toFixed(2)}，人类自评未收集`;
  }

  if (Math.abs(delta) < 0.1) {
    return `${label}：引擎与人类认知一致（差值 ${delta.toFixed(2)}，${sampleCount} 次自评）`;
  }

  if (delta > 0) {
    return `${label}：人类比引擎乐观（+${delta.toFixed(2)}，${sampleCount} 次自评）。团队可能高估了自身在该维度的表现`;
  }

  return `${label}：人类比引擎悲观（${delta.toFixed(2)}，${sampleCount} 次自评）。团队可能低估了自身在该维度的表现`;
}

function buildOverallInterpretation(
  overallGap: number,
  significantDeltas: SelfAwarenessDelta[],
  allDeltas: SelfAwarenessDelta[],
): string {
  const collectedCount = allDeltas.filter((d) => d.humanScore !== null).length;

  if (collectedCount === 0) {
    return '尚未收集到任何自评数据。引擎观测值仅反映基于协作数据的推断。';
  }

  if (significantDeltas.length === 0) {
    return `团队自评与引擎观测总体一致（平均偏差 ${overallGap.toFixed(2)}）。${collectedCount}/${allDeltas.length} 个维度已收集自评。`;
  }

  const dimNames = significantDeltas.map(
    (d) => DIM_LABELS[d.dimension] ?? d.dimension,
  );
  return `${dimNames.join('、')} 维度存在显著认知偏差（>0.2）。建议重点关注这些维度的团队认知校准。`;
}
