/**
 * diagnosis/observer-bridge.ts — Observer 数据到诊断引擎的桥接
 *
 * 将 observer/ 模块采集的 Agent 运行时健康数据转换为诊断快照格式。
 * 来源标记为 `periodic_check`，区别于 Phase C 管线产生的 `phase-c` 快照。
 *
 * 纯函数转换：不修改 observer 内部逻辑，不改变 observer 输出格式。
 */

import type { GapSnapshot, GapDimensionScore } from './types';
import type { GapDimension } from '../schema-bridge';
import type { TeamHealthSnapshot, GapHealthMetric } from '../../observer/team-observer-types';
import { recordGapSnapshot } from './gap-recorder';

// ====================================================================
// Mapping: GapId (observer) → GapDimension (diagnosis)
// ====================================================================

const OBSERVER_TO_DIAGNOSIS: Record<string, GapDimension> = {
  division_of_labor: 'division_of_labor',
  information_flow: 'information_flow',
  authority_governance: 'authority_governance',
  trust_incentive: 'trust_incentive',
  knowledge_sharing: 'knowledge_sharing',
  external_interface: 'external_interface',
};

const GAP_DIMENSIONS: GapDimension[] = [
  'division_of_labor',
  'information_flow',
  'authority_governance',
  'trust_incentive',
  'knowledge_sharing',
  'external_interface',
];

// ====================================================================
// Conversion helpers
// ====================================================================

function statusToConfidence(status: GapHealthMetric['status']): 'high' | 'medium' | 'low' {
  switch (status) {
    case 'healthy': return 'high';
    case 'degrading': return 'medium';
    case 'critical': return 'low';
    default: return 'medium';
  }
}

function metricToEngineScore(metric: GapHealthMetric): number {
  // Composite score from runtime metrics
  const conflictPenalty = Math.min(metric.conflictRate * 0.5, 0.3);
  const escalatePenalty = Math.min(metric.escalateRate * 0.5, 0.2);
  const interventionPenalty = Math.min(metric.interventionRate * 0.5, 0.2);
  return Math.max(0, Math.min(1, 1.0 - conflictPenalty - escalatePenalty - interventionPenalty));
}

function buildRuntimeSourceBreakdown(metric: GapHealthMetric): Record<string, number> {
  return {
    runtime_events: 0.3,
    conflict_rate: 0.25,
    escalate_rate: 0.25,
    intervention_rate: 0.2,
  };
}

// ====================================================================
// Public API
// ====================================================================

/**
 * Convert a TeamHealthSnapshot from the observer into a GapSnapshot
 * for the diagnosis engine. Source is marked as `periodic_check`.
 */
export function bridgeHealthSnapshot(health: TeamHealthSnapshot): GapSnapshot | null {
  if (!health || !health.gaps || health.gaps.length === 0) return null;

  const gaps = {} as Record<GapDimension, GapDimensionScore>;

  // Map observer gap metrics to diagnosis format
  for (const metric of health.gaps) {
    const dim = OBSERVER_TO_DIAGNOSIS[metric.dimension];
    if (!dim) continue;

    gaps[dim] = {
      mode: `runtime_${metric.status}`,
      engineScore: metricToEngineScore(metric),
      confidence: statusToConfidence(metric.status),
      sourceBreakdown: buildRuntimeSourceBreakdown(metric),
    };
  }

  // Fill any missing dimensions with defaults
  for (const dim of GAP_DIMENSIONS) {
    if (!gaps[dim]) {
      gaps[dim] = {
        mode: 'runtime_unknown',
        engineScore: 0.5,
        confidence: 'low',
        sourceBreakdown: { runtime_events: 0.5, inferred: 0.5 },
      };
    }
  }

  return {
    teamId: health.blueprintId,
    observedAt: health.timestamp || new Date().toISOString(),
    sourcePipeline: 'periodic_check',
    gaps,
  };
}

/**
 * Bridge an observer health snapshot into the diagnosis timeline.
 * Convenience function that converts + records in one call.
 */
export function bridgeAndRecord(health: TeamHealthSnapshot): GapSnapshot | null {
  const snapshot = bridgeHealthSnapshot(health);
  if (snapshot) {
    recordGapSnapshot(snapshot);
  }
  return snapshot;
}
