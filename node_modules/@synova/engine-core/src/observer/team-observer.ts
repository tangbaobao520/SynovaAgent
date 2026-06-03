/**
 * harness/team-observer.ts — Team Observer 运行时健康指标采集
 *
 * 从 collaboration-collector 和 ProtocolInterceptor 聚合团队级健康指标。
 * 只读不写——不修改任何消息或配置。
 *
 * V2: SQLite 持久化 → harness_observer_metrics 表，重启不丢失。
 * SQLite 不可用时降级为内存 Map + console.warn。
 */

import type {
  TeamHealthSnapshot,
  GapHealthMetric,
  DegradationWarning,
  GapId,
} from './team-observer-types';
import { GAP_LABELS } from './team-observer-types';
import { getAllStats, getRecentEvents } from '../pipeline/collaboration-collector';
import {
  saveHealthSnapshotDB,
  loadHealthSnapshotsDB,
  saveWarningsDB,
  loadWarningsDB,
  saveKnowledgeRecordDB,
  loadKnowledgeRecordsDB,
} from '../storage';
import { evaluateOutcomes } from '../evolution/evolution-engine';
import { welchTTest } from './stats-utils';

// ================================================================
// 存储（内存缓存 + SQLite 持久化）
// ================================================================

const teamSnapshots = new Map<string, TeamHealthSnapshot[]>();
const MAX_SNAPSHOTS = 60;
const warningsLog = new Map<string, DegradationWarning[]>();

// ================================================================
// 健康快照采集
// ================================================================

const GAP_ID_MAP: Record<string, GapId> = {
  division_of_labor: 'division_of_labor',
  information_flow: 'information_flow',
  authority_governance: 'authority_governance',
  trust_incentive: 'trust_incentive',
  knowledge_sharing: 'knowledge_sharing',
  external_interface: 'external_interface',
};

export function collectHealthSnapshot(
  blueprintId: string,
  teamName: string,
  options?: {
    agentCount?: number;
    uptimeHours?: number;
    interceptorStats?: {
      totalIntercepts: number;
      locks: number;
      blocks: number;
      warns: number;
      overrides: number;
      circuitBreakerTrips: number;
      fallbacks: number;
      llmCalls: number;
    };
  },
): TeamHealthSnapshot {
  const now = new Date().toISOString();
  const allStats = getAllStats();
  const recentEvents = getRecentEvents(50);

  // 从 collaboration-collector 构建各维度健康指标
  const gaps: GapHealthMetric[] = [];
  let totalEvents = 0;
  let totalConflictRate = 0;
  let totalEscalateRate = 0;
  let totalInterventionRate = 0;
  let totalAvgResponseMs = 0;
  let gapCount = 0;

  for (const [dim, counter] of Object.entries(allStats)) {
    const gapId = GAP_ID_MAP[dim] || null;
    if (!gapId) continue;

    const c = counter as {
      totalEvents: number;
      outcomes: { resolved: number; escalated: number; deadlocked: number };
      humanInterventions: number;
      totalDurationMs: number;
      lastEventAt: string;
    };

    const conflictRate = c.totalEvents > 0
      ? c.outcomes.deadlocked / c.totalEvents
      : 0;
    const escalateRate = c.totalEvents > 0
      ? c.outcomes.escalated / c.totalEvents
      : 0;
    const interventionRate = c.totalEvents > 0
      ? c.humanInterventions / c.totalEvents
      : 0;
    const avgResponseMs = c.totalEvents > 0
      ? c.totalDurationMs / c.totalEvents
      : 0;

    let status: 'healthy' | 'degrading' | 'critical' = 'healthy';
    if (conflictRate > 0.3 || escalateRate > 0.5) {
      status = 'critical';
    } else if (conflictRate > 0.1 || escalateRate > 0.2) {
      status = 'degrading';
    }

    gaps.push({
      dimension: gapId,
      label: GAP_LABELS[gapId],
      totalEvents: c.totalEvents,
      conflictRate,
      escalateRate,
      interventionRate,
      avgResponseMs,
      status,
      lastEventAt: c.lastEventAt || now,
    });

    totalEvents += c.totalEvents;
    totalConflictRate += conflictRate;
    totalEscalateRate += escalateRate;
    totalInterventionRate += interventionRate;
    totalAvgResponseMs += avgResponseMs;
    gapCount++;
  }

  // 填充无事件的缝隙（默认健康）
  for (const [gapId, label] of Object.entries(GAP_LABELS)) {
    if (!gaps.find(g => g.dimension === gapId)) {
      gaps.push({
        dimension: gapId as GapId,
        label,
        totalEvents: 0,
        conflictRate: 0,
        escalateRate: 0,
        interventionRate: 0,
        avgResponseMs: 0,
        status: 'healthy',
        lastEventAt: now,
      });
    }
  }

  // 整体健康分计算
  const avgConflictRate = gapCount > 0 ? totalConflictRate / 8 : 0;
  const avgEscalateRate = gapCount > 0 ? totalEscalateRate / 8 : 0;
  const avgInterventionRate = gapCount > 0 ? totalInterventionRate / 8 : 0;
  const overallScore = Math.max(0, Math.min(100, Math.round(
    100 - (avgConflictRate * 60 + avgEscalateRate * 30 + avgInterventionRate * 10) * 100,
  )));

  // 决策质量
  const avgLatencyMs = gapCount > 0 ? totalAvgResponseMs / gapCount : 0;
  const prevSnapshot = getLatestSnapshot(blueprintId);
  const decisionTrend = prevSnapshot
    ? (avgLatencyMs < prevSnapshot.decisionQuality.avgLatencyMs * 0.9
      ? 'improving' as const
      : avgLatencyMs > prevSnapshot.decisionQuality.avgLatencyMs * 1.2
        ? 'declining' as const
        : 'stable' as const)
    : 'stable' as const;

  // 产出质量趋势
  const outputTrend = prevSnapshot
    ? ((prevSnapshot.outputQuality.currentScore ?? 0) < overallScore
      ? 'improving' as const
      : (prevSnapshot.outputQuality.currentScore ?? 0) > overallScore
        ? 'declining' as const
        : 'stable' as const)
    : 'stable' as const;

  // 检测退化警告
  const degradationWarnings = detectDegradationWarnings(gaps, recentEvents, prevSnapshot, options?.interceptorStats);

  const snapshot: TeamHealthSnapshot = {
    blueprintId,
    teamName,
    timestamp: now,
    overallScore,
    gaps,
    decisionQuality: {
      avgLatencyMs,
      escalationRate: gapCount > 0 ? totalEscalateRate / gapCount : 0,
      trend: decisionTrend,
    },
    outputQuality: {
      currentScore: overallScore,
      previousScore: prevSnapshot?.overallScore ?? null,
      trend: outputTrend,
    },
    agentCount: options?.agentCount ?? 0,
    totalMessages: totalEvents,
    uptimeHours: options?.uptimeHours ?? 0,
    circuitBreakerTrips: options?.interceptorStats?.circuitBreakerTrips ?? 0,
    degradationWarnings,
  };

  // 追加到快照历史（内存缓存 + SQLite 持久化）
  let list = teamSnapshots.get(blueprintId);
  if (!list) {
    list = loadHealthSnapshotsDB(blueprintId);
    teamSnapshots.set(blueprintId, list);
  }
  list.push(snapshot);
  while (list.length > MAX_SNAPSHOTS) list.shift();
  saveHealthSnapshotDB(snapshot);

  // 追加警告到日志
  if (degradationWarnings.length > 0) {
    let wl = warningsLog.get(blueprintId);
    if (!wl) {
      wl = loadWarningsDB(blueprintId);
      warningsLog.set(blueprintId, wl);
    }
    wl.push(...degradationWarnings);
    while (wl.length > 200) wl.shift();
    saveWarningsDB(blueprintId, wl);
  }

  // 触发进化结果评估——检查是否有 pending 的优化建议需要 outcome 追踪
  evaluateOutcomes(blueprintId, snapshot);

  return snapshot;
}

// ================================================================
// 退化检测
// ================================================================

function detectDegradationWarnings(
  gaps: GapHealthMetric[],
  recentEvents: Array<{ timestamp: string; gapDimension: string }>,
  prevSnapshot: TeamHealthSnapshot | undefined,
  interceptorStats?: { circuitBreakerTrips: number; fallbacks: number; totalIntercepts: number },
): DegradationWarning[] {
  const warnings: DegradationWarning[] = [];
  const now = new Date().toISOString();

  for (const gap of gaps) {
    // 冲突尖峰
    if (gap.conflictRate > 0.3) {
      warnings.push({
        type: 'conflict_spike',
        severity: gap.conflictRate > 0.5 ? 'critical' : 'warn',
        message: `${gap.label} 冲突率达 ${(gap.conflictRate * 100).toFixed(0)}%，超过 30% 阈值`,
        detectedAt: now,
        dimension: gap.dimension,
      });
    }

    // 决策停滞
    if (gap.avgResponseMs > 30000 && gap.totalEvents > 5) {
      warnings.push({
        type: 'decision_stall',
        severity: gap.avgResponseMs > 60000 ? 'critical' : 'warn',
        message: `${gap.label} 平均响应耗时 ${(gap.avgResponseMs / 1000).toFixed(1)}s，可能决策壅塞`,
        detectedAt: now,
        dimension: gap.dimension,
      });
    }
  }

  // 质量滑坡：Welch's t-test 退化检测
  if (prevSnapshot) {
    const history = teamSnapshots.get(prevSnapshot.blueprintId) || [];
    if (history.length >= 20) {
      const recent10 = history.slice(-10);
      const prior10 = history.slice(-20, -10);
      const testResult = welchTTest(
        prior10.map(h => h.overallScore),
        recent10.map(h => h.overallScore),
      );
      if (testResult.significant && testResult.meanDiff < 0) {
        warnings.push({
          type: 'quality_drop',
          severity: 'critical',
          message: `健康分显著下降（p=${testResult.pValue.toFixed(4)}，均值差 ${testResult.meanDiff.toFixed(1)}，t=${testResult.tStat.toFixed(2)}，df=${testResult.df.toFixed(0)}）`,
          detectedAt: now,
        });
      }
    } else {
      // 样本不足 20 时保留简单连续下降逻辑作为 fallback
      let consecutiveDrops = 0;
      for (let i = history.length - 1; i >= 0; i--) {
        const prev = history[i];
        const next = history[i + 1];
        if (next && (next.overallScore < (prev?.overallScore ?? next.overallScore))) {
          consecutiveDrops++;
        } else {
          break;
        }
      }
      if (consecutiveDrops >= 3) {
        warnings.push({
          type: 'quality_drop',
          severity: 'critical',
          message: `整体健康分连续 ${consecutiveDrops} 次下降（样本不足，使用 fallback 检测），当前 ${prevSnapshot.overallScore} 分`,
          detectedAt: now,
        });
      }
    }
  }

  // 信任降级
  const trustGap = gaps.find(g => g.dimension === 'trust_incentive');
  if (trustGap && trustGap.conflictRate > 0.2) {
    warnings.push({
      type: 'trust_decay',
      severity: trustGap.conflictRate > 0.4 ? 'critical' : 'warn',
      message: `信任模型冲突率 ${(trustGap.conflictRate * 100).toFixed(0)}%，可能出现信任崩解`,
      detectedAt: now,
      dimension: 'trust_incentive',
    });
  }

  // 信息孤岛
  const infoGap = gaps.find(g => g.dimension === 'information_flow');
  if (infoGap && recentEvents.length > 20) {
    const recentInfoEvents = recentEvents.filter(e => e.gapDimension === 'information_flow');
    const recentOtherEvents = recentEvents.filter(e => e.gapDimension !== 'information_flow');
    const ratio = recentOtherEvents.length > 0
      ? recentInfoEvents.length / recentOtherEvents.length
      : 0;
    if (ratio > 0.5 || ratio < 0.1) {
      warnings.push({
        type: 'info_silo',
        severity: 'warn',
        message: `信息流比例失衡 (${(ratio * 100).toFixed(0)}%)，可能存在信息孤岛或过载`,
        detectedAt: now,
        dimension: 'information_flow',
      });
    }
  }

  // 熔断器频繁触发
  if (interceptorStats && interceptorStats.circuitBreakerTrips > 2) {
    warnings.push({
      type: 'conflict_spike',
      severity: 'critical',
      message: `熔断器已触发 ${interceptorStats.circuitBreakerTrips} 次，系统稳定性下降`,
      detectedAt: now,
      dimension: 'authority_governance',
    });
  }

  // Fallback 率过高（降级比例超过 20%）
  if (interceptorStats && interceptorStats.totalIntercepts > 100) {
    const fallbackRate = interceptorStats.fallbacks / interceptorStats.totalIntercepts;
    if (fallbackRate > 0.2) {
      warnings.push({
        type: 'decision_stall',
        severity: 'warn',
        message: `LLM Judge 降级率达 ${(fallbackRate * 100).toFixed(0)}%，裁决质量可能下降`,
        detectedAt: now,
        dimension: 'authority_governance',
      });
    }
  }

  return warnings;
}

// ================================================================
// 查询接口
// ================================================================

export function getLatestSnapshot(blueprintId: string): TeamHealthSnapshot | undefined {
  const list = teamSnapshots.get(blueprintId);
  if (!list || list.length === 0) return undefined;
  return list[list.length - 1];
}

export function getSnapshotHistory(blueprintId: string, limit = 20): TeamHealthSnapshot[] {
  const list = teamSnapshots.get(blueprintId);
  if (!list) return [];
  return list.slice(-limit);
}

export function getWarnings(blueprintId: string, limit = 20): DegradationWarning[] {
  const wl = warningsLog.get(blueprintId);
  if (!wl) return [];
  return wl.slice(-limit);
}

export function getTeamList(): Array<{
  blueprintId: string;
  teamName: string;
  agentCount: number;
  status: 'running' | 'degraded' | 'stopped';
  healthScore: number;
  lastActivityAt: string;
  uptimeHours: number;
}> {
  const teams: Array<{
    blueprintId: string;
    teamName: string;
    agentCount: number;
    status: 'running' | 'degraded' | 'stopped';
    healthScore: number;
    lastActivityAt: string;
    uptimeHours: number;
  }> = [];

  for (const [blueprintId, list] of teamSnapshots) {
    const latest = list[list.length - 1];
    if (!latest) continue;

    let status: 'running' | 'degraded' | 'stopped' = 'running';
    if (latest.overallScore < 50) {
      status = 'stopped';
    } else if (latest.degradationWarnings.some(w => w.severity === 'critical')) {
      status = 'degraded';
    }

    teams.push({
      blueprintId,
      teamName: latest.teamName,
      agentCount: latest.agentCount,
      status,
      healthScore: latest.overallScore,
      lastActivityAt: latest.timestamp,
      uptimeHours: latest.uptimeHours,
    });
  }

  return teams.sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
}

export function clearTeamData(blueprintId: string): void {
  teamSnapshots.delete(blueprintId);
  warningsLog.delete(blueprintId);
}

// ================================================================
// 知识注入事件追踪
// ================================================================

export interface KnowledgeInjectionRecord {
  blueprintId: string;
  timestamp: string;
  totalEntries: number;
  entriesWithImplication: number;
  avgDeviation: number;
  agentCount: number;
  sharedCount: number;
}

const knowledgeRecords = new Map<string, KnowledgeInjectionRecord[]>();

export function recordKnowledgeInjection(record: KnowledgeInjectionRecord): void {
  let list = knowledgeRecords.get(record.blueprintId);
  if (!list) {
    list = loadKnowledgeRecordsDB(record.blueprintId);
    knowledgeRecords.set(record.blueprintId, list);
  }
  list.push(record);
  while (list.length > 50) list.shift();
  saveKnowledgeRecordDB(record);
}

export function getKnowledgeInjectionHistory(
  blueprintId: string,
  limit = 10,
): KnowledgeInjectionRecord[] {
  const list = knowledgeRecords.get(blueprintId);
  if (!list) return [];
  return list.slice(-limit);
}

export function getLatestKnowledgeInjection(
  blueprintId: string,
): KnowledgeInjectionRecord | undefined {
  const list = knowledgeRecords.get(blueprintId);
  if (!list || list.length === 0) return undefined;
  return list[list.length - 1];
}
