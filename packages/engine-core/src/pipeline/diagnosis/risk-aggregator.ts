/**
 * diagnosis/risk-aggregator.ts — 组织风险聚合分析 (SOG v1.0, P1)
 *
 * 遍历所有 Risk 节点，生成组织级风险概览与热力图。
 * 基于 SOG Risk 节点 + AFFECTS/TRIGGERS/BELONGS_TO 边。
 *
 * 算法：
 *   1. 查询所有 Risk 节点
 *   2. 按 severity (low/medium/high/critical)、status (active/mitigated/resolved)、
 *      riskType 分组
 *   3. 追踪每个风险节点的 AFFECTS 出边，找到受影响的实体，累积风险分数
 *      (severity -> numeric: low=0.25, medium=0.5, high=0.75, critical=1.0)
 *   4. 排序并输出 top 风险
 *   5. 生成风险热力图（按风险类型分组的 severity 分布矩阵）
 *
 * 纯函数核心 + GraphStore 集成包装器。
 * 零 LLM 调用，confidenceModel: 'deterministic'。
 */

import { SOGNodeType, SOGEdgeType } from '@synova/sog-core';
import type { DiagnosticModule } from './module-registry';
import { createLogger } from '../../infra/logger';
import { getEngineContext } from '../../engine-context';
import { createGraphStore } from './graph-store';
import type { GraphStore } from './graph-store';

const log = createLogger('engine-server/pipeline/diagnosis/risk-aggregator');

// ════════════════════════════════════════════════════════════════
// Severity -> Numeric Score Mapping
// ════════════════════════════════════════════════════════════════

const SEVERITY_SCORE: Record<string, number> = {
  low: 0.25,
  medium: 0.50,
  high: 0.75,
  critical: 1.0,
};

/** All valid severity labels */
const ALL_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;

/** All valid risk statuses */
const ALL_STATUSES = ['active', 'mitigated', 'resolved'] as const;

// ════════════════════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════════════════════

/** A single top risk entry in the aggregated report. */
export interface TopRisk {
  /** Risk node ID */
  riskId: string;
  /** Risk type label (e.g. "key_person", "technical_debt", "market") */
  riskType: string;
  /** Severity level */
  severity: string;
  /** Status */
  status: string;
  /** Numeric risk score (severity -> numeric, 0-1) */
  score: number;
  /** IDs of entities affected by this risk (via AFFECTS edges) */
  affectedEntities: string[];
  /** Number of affected entities */
  affectedCount: number;
  /** Accumulated risk impact = score * (1 + affectedCount * 0.2), capped at 1.0 */
  impact: number;
}

/** A single heatmap bucket entry. */
export interface RiskHeatmapEntry {
  /** Risk type category */
  riskType: string;
  /** Count of risks per severity level */
  severityCounts: Record<string, number>;
  /** Total risks in this category */
  total: number;
  /** Weighted sum of severity scores */
  weightedSum: number;
  /** Mean severity score for this category (0-1) */
  meanSeverity: number;
}

/** Top-level report returned by computeRiskAggregation. */
export interface RiskAggregationReport {
  /** Total number of Risk nodes found */
  totalRisks: number;
  /** Risk count grouped by severity */
  bySeverity: Record<string, number>;
  /** Risk count grouped by riskType */
  byType: Record<string, number>;
  /** Risk count grouped by status */
  byStatus: Record<string, number>;
  /** Top risks sorted by impact descending */
  topRisks: TopRisk[];
  /** Heatmap: risk type x severity distribution */
  riskHeatmap: RiskHeatmapEntry[];
  /** Human-readable interpretation in Chinese */
  interpretation: string;
  /** Degraded modules list (iron law 31) */
  degradedModules?: string[];
}

// ════════════════════════════════════════════════════════════════
// Input types (pure-function interface)
// ════════════════════════════════════════════════════════════════

/** Simplified Risk node for the pure function. */
export interface RiskNode {
  id: string;
  riskType: string;
  severity: string;
  status: string;
}

/** Simplified edge for the pure function. */
export interface RiskEdge {
  from: string;
  to: string;
  type: SOGEdgeType;
}

// ════════════════════════════════════════════════════════════════
// Core computation (pure function — testable with zero I/O)
// ════════════════════════════════════════════════════════════════

/**
 * Compute risk aggregation from SOG subgraph data.
 *
 * Pure function — accepts explicit data, performs zero I/O.
 * This is the primary entry point for both direct callers and the GraphStore wrapper.
 *
 * @param risks               - Risk nodes from the ontology
 * @param allEdges            - All edges (AFFECTS/TRIGGERS/BELONGS_TO used; others ignored)
 * @param affectedEntityTypes - Optional map from entity node ID to its SOGNodeType (for context)
 * @returns RiskAggregationReport with statistics, top risks, heatmap, and interpretation
 */
export function computeRiskAggregation(
  risks: RiskNode[],
  allEdges: RiskEdge[],
  affectedEntityTypes: Record<string, string> = {},
): RiskAggregationReport {
  // ── Empty graph ──
  if (risks.length === 0) {
    return {
      totalRisks: 0,
      bySeverity: Object.fromEntries(ALL_SEVERITIES.map(s => [s, 0])),
      byType: {},
      byStatus: Object.fromEntries(ALL_STATUSES.map(s => [s, 0])),
      topRisks: [],
      riskHeatmap: [],
      interpretation:
        '组织图谱中无 Risk 节点，无法计算风险聚合。请先通过诊断访谈或手动配置建立组织风险清单。',
    };
  }

  // ── 1. Partition edges: only AFFECTS, TRIGGERS, BELONGS_TO are risk-relevant ──
  const riskEdgeTypes = new Set([
    SOGEdgeType.AFFECTS,
    SOGEdgeType.TRIGGERS,
    SOGEdgeType.BELONGS_TO,
  ]);
  const relevantEdges = allEdges.filter(e => riskEdgeTypes.has(e.type));

  // Build adjacency: riskId -> set of affected entity IDs (outgoing edges from risk)
  const riskAffectedMap = new Map<string, Set<string>>();
  for (const e of relevantEdges) {
    if (risks.some(r => r.id === e.from)) {
      if (!riskAffectedMap.has(e.from)) riskAffectedMap.set(e.from, new Set());
      riskAffectedMap.get(e.from)!.add(e.to);
    }
  }

  // ── 2. Build group statistics ──

  // bySeverity: initialize all severities to 0
  const bySeverity: Record<string, number> = {};
  for (const s of ALL_SEVERITIES) bySeverity[s] = 0;

  const byType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  for (const s of ALL_STATUSES) byStatus[s] = 0;

  for (const r of risks) {
    bySeverity[r.severity] = (bySeverity[r.severity] ?? 0) + 1;
    byType[r.riskType] = (byType[r.riskType] ?? 0) + 1;
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  }

  // ── 3. Build top risks list ──
  const topRisks: TopRisk[] = risks.map(r => {
    const score = SEVERITY_SCORE[r.severity] ?? 0.5;
    const affectedSet = riskAffectedMap.get(r.id);
    const affectedEntities = affectedSet ? [...affectedSet] : [];
    const affectedCount = affectedEntities.length;
    // Impact formula: score * (1 + affectedCount * 0.2), capped at 1.0
    const impact = Math.min(1.0, score * (1 + affectedCount * 0.2));

    return {
      riskId: r.id,
      riskType: r.riskType,
      severity: r.severity,
      status: r.status,
      score,
      affectedEntities,
      affectedCount,
      impact: Math.round(impact * 1000) / 1000,
    };
  });

  // Sort by impact descending, then by score descending
  topRisks.sort((a, b) => b.impact - a.impact || b.score - a.score);

  // ── 4. Build risk heatmap ──
  // Group by riskType, compute severity distribution
  const heatmapBuckets = new Map<string, Map<string, number>>();
  for (const r of risks) {
    if (!heatmapBuckets.has(r.riskType)) {
      heatmapBuckets.set(r.riskType, new Map());
    }
    const severityMap = heatmapBuckets.get(r.riskType)!;
    severityMap.set(r.severity, (severityMap.get(r.severity) ?? 0) + 1);
  }

  const riskHeatmap: RiskHeatmapEntry[] = [];
  for (const [riskType, severityMap] of heatmapBuckets) {
    const severityCounts: Record<string, number> = {};
    let total = 0;
    let weightedSum = 0;

    for (const s of ALL_SEVERITIES) {
      const count = severityMap.get(s) ?? 0;
      severityCounts[s] = count;
      total += count;
      weightedSum += count * (SEVERITY_SCORE[s] ?? 0);
    }

    riskHeatmap.push({
      riskType,
      severityCounts,
      total,
      weightedSum: Math.round(weightedSum * 1000) / 1000,
      meanSeverity: total > 0 ? Math.round((weightedSum / total) * 1000) / 1000 : 0,
    });
  }

  // Sort heatmap by mean severity descending, then by total descending
  riskHeatmap.sort((a, b) => b.meanSeverity - a.meanSeverity || b.total - a.total);

  // ── 5. Build interpretation ──
  const criticalCount = bySeverity['critical'] ?? 0;
  const highCount = bySeverity['high'] ?? 0;
  const activeCount = byStatus['active'] ?? 0;
  const totalAffected = topRisks.reduce((sum, r) => sum + r.affectedCount, 0);

  let interpretation = `共 ${risks.length} 个风险`;
  if (risks.length > 0) {
    const typeLabels = Object.entries(byType)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([t, c]) => `${t}(${c})`)
      .join('、');
    interpretation += `，主要类型：${typeLabels}。`;
  }

  if (criticalCount > 0) {
    interpretation += ` ${criticalCount} 个 critical 级别风险需立即处理。`;
  }
  if (highCount > 0) {
    interpretation += ` ${highCount} 个 high 级别风险建议近期处理。`;
  }
  if (activeCount > 0) {
    interpretation += ` 活跃风险 ${activeCount} 个。`;
  }
  if (totalAffected > 0) {
    interpretation += ` 共影响 ${totalAffected} 个实体。`;
  }
  if (criticalCount === 0 && highCount === 0) {
    interpretation += ' 当前无高危风险，组织风险处于可控水平。';
  }

  return {
    totalRisks: risks.length,
    bySeverity,
    byType,
    byStatus,
    topRisks,
    riskHeatmap,
    interpretation,
  };
}

// ════════════════════════════════════════════════════════════════
// GraphStore-integrated wrapper (follows goal-alignment pattern)
// ════════════════════════════════════════════════════════════════

/**
 * Compute risk aggregation by querying the SOG graph store.
 *
 * Follows the same pattern as computeGoalAlignmentFromGraph():
 *   1. Resolve database via engine context
 *   2. Create GraphStore
 *   3. Query Risk nodes + AFFECTS/TRIGGERS/BELONGS_TO edges
 *   4. Delegate to pure function computeRiskAggregation()
 *
 * Returns null when the graph store or required data is unavailable.
 */
function computeRiskAggregationFromGraph(teamId: string): RiskAggregationReport | null {
  // ── 1. Get database + create graph store ──
  let db: unknown;
  try {
    db = getEngineContext().database.getDb();
  } catch {
    log.debug('[risk-aggregator] Database not injected — skipping SOG path');
    return null;
  }

  let store: GraphStore;
  try {
    store = createGraphStore('sqlite', db);
  } catch (err) {
    log.warn({ err, teamId }, '[risk-aggregator] Failed to create GraphStore — skipping SOG path');
    return null;
  }

  // ── 2. Query Risk nodes ──
  let riskNodes: Array<{ id: string; type: string; props: Record<string, unknown> }>;
  try {
    riskNodes = store.queryNodes(SOGNodeType.RISK, undefined, teamId);
  } catch (err) {
    log.warn({ err, teamId }, '[risk-aggregator] Failed to query Risk nodes');
    return null;
  }

  if (riskNodes.length === 0) {
    log.debug('[risk-aggregator] No Risk nodes found in SOG graph');
    return computeRiskAggregation([], []);
  }

  // ── 3. Convert to pure-function input types ──
  const risks: RiskNode[] = riskNodes.map(n => ({
    id: n.id,
    riskType: String(n.props.riskType ?? 'unknown'),
    severity: String(n.props.severity ?? 'medium'),
    status: String(n.props.status ?? 'active'),
  }));

  // ── 4. Query relevant edges: AFFECTS, TRIGGERS, BELONGS_TO ──
  const relevantEdgeTypes = [SOGEdgeType.AFFECTS, SOGEdgeType.TRIGGERS, SOGEdgeType.BELONGS_TO];
  let allEdgesRaw: Array<{
    id: string; type: string; from: string; to: string; weight: number;
    props: Record<string, unknown>;
  }> = [];

  try {
    for (const edgeType of relevantEdgeTypes) {
      const edgesOfType = store.queryEdges(edgeType, undefined, undefined, teamId);
      allEdgesRaw = allEdgesRaw.concat(edgesOfType);
    }
  } catch (err) {
    log.warn({ err, teamId }, '[risk-aggregator] Failed to query risk-relevant edges');
    return null;
  }

  const allEdges: RiskEdge[] = allEdgesRaw.map(e => ({
    from: e.from,
    to: e.to,
    type: e.type as SOGEdgeType,
  }));

  // ── 5. Resolve affected entity types (lazy, with cache) ──
  const affectedEntityIds = new Set<string>();
  for (const e of allEdges) {
    if (risks.some(r => r.id === e.from)) {
      affectedEntityIds.add(e.to);
    }
  }

  const affectedEntityTypes: Record<string, string> = {};
  for (const entityId of affectedEntityIds) {
    try {
      const node = store.getNode(entityId, teamId);
      if (node) {
        affectedEntityTypes[entityId] = node.type;
      }
    } catch {
      // Entity not found — skip
    }
  }

  // ── 6. Delegate to pure function ──
  return computeRiskAggregation(risks, allEdges, affectedEntityTypes);
}

// ════════════════════════════════════════════════════════════════
// DiagnosticModule-compatible compute (iron law 31: degraded signal)
// ════════════════════════════════════════════════════════════════

/**
 * Module compute function — DiagnosticModule-compatible.
 *
 * PRIMARY: GraphStore-based (SOG Risk nodes + AFFECTS/TRIGGERS/BELONGS_TO edges).
 * FALLBACK: Returns an empty report with interpretation guidance.
 *
 * Iron law 31: Degraded signal propagated via degradedModules[].
 */
async function riskAggregationCompute(teamId: string): Promise<RiskAggregationReport> {
  const degradedModules: string[] = [];

  // ── PRIMARY: SOG graph-based aggregation ──
  try {
    const sogResult = computeRiskAggregationFromGraph(teamId);
    if (sogResult !== null) {
      return sogResult;
    }
  } catch (err) {
    log.warn({ err, teamId }, '[risk-aggregator] Graph-based computation failed');
    degradedModules.push('risk-aggregator:sog');
  }

  // ── FALLBACK: empty report ──
  log.warn({ teamId, degradedModules }, '[risk-aggregator] No SOG data available — returning empty report');
  return {
    totalRisks: 0,
    bySeverity: Object.fromEntries(ALL_SEVERITIES.map(s => [s, 0])),
    byType: {},
    byStatus: Object.fromEntries(ALL_STATUSES.map(s => [s, 0])),
    topRisks: [],
    riskHeatmap: [],
    interpretation:
      '无法计算风险聚合：组织图谱中无 Risk 节点或图存储不可用。请先通过诊断访谈建立组织风险清单。',
    degradedModules,
  };
}

// ════════════════════════════════════════════════════════════════
// DiagnosticModule declaration
// ════════════════════════════════════════════════════════════════

export const riskAggregatorModule: DiagnosticModule = {
  id: 'risk-aggregator',
  version: '1.0.0',
  priority: 'P1',
  requiredDataSources: {},
  confidenceModel: 'deterministic',
  label: '风险聚合',
  description: 'SOG v1.0: Risk 节点遍历->风险概览+热力图+topN 排序',
  ontologyRole: 'analyzer',
  compute: riskAggregationCompute,
};
