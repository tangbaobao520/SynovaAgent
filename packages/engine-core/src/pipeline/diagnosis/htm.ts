/**
 * diagnosis/htm.ts — 混合信任模型 (Hybrid Trust Model, ARCH-06 #17)
 *
 * 替代心理安全感：不研究"人是否害怕犯错"，而是研究"信任机制是否校准"。
 *
 * 核心信号：
 *   1. 人对 Agent 信任曲线 — HITL 修正频率的时间序列斜率
 *   2. 自动接受率 — Agent 输出被人直接接受的比例
 *   3. Agent 间信任 — Agent→Agent 调用的错误传播率
 *   4. 信任衰减事件 — 重大错误后修正频率突变检测
 *
 * 数据源：collaboration_events / routing_events / agent_metrics 表
 */

import type { HTMReport, TrustCurve, TrustDecayEvent, SinglePointRisk } from './types';
import { getEngineContext } from '../../engine-context';
import { getAllStats, getRecentEvents } from '../collaboration-collector';
import { createLogger } from '../../infra/logger';

const log = createLogger('engine-server/pipeline/diagnosis/htm');

// ====================================================================
// DB access helper
// ====================================================================

function getDb(): any | null {
  try { return getEngineContext().database.getDb(); } catch { log.debug('[htm] database not available via engine context'); return null; }
}

// ====================================================================
// Public API
// ====================================================================

/**
 * Compute Hybrid Trust Model report for a team.
 * Returns null if insufficient collaboration data.
 */
export function computeHTM(teamId: string): HTMReport | null {
  const logger = getEngineContext().logger;
  const db = getDb();

  // ── 1. HITL correction trend from collaboration_events ──
  const trustCurves = computeTrustCurves(db, teamId, logger);

  // ── 2. Auto-acceptance rate from collaboration-collector stats ──
  const stats = getAllStats();
  const allDims = Object.values(stats);
  let totalEvents = 0;
  let totalResolved = 0;
  let totalEscalated = 0;
  let totalDeadlocked = 0;
  let totalInterventions = 0;
  for (const dim of allDims) {
    totalEvents += dim.totalEvents;
    totalResolved += dim.outcomes.resolved;
    totalEscalated += dim.outcomes.escalated;
    totalDeadlocked += dim.outcomes.deadlocked;
    totalInterventions += dim.humanInterventions;
  }

  if (totalEvents === 0) return null;

  const autoAcceptRate = totalResolved / Math.max(totalEvents, 1);
  const escalationRate = totalEscalated / Math.max(totalEvents, 1);
  const deadlockRate = totalDeadlocked / Math.max(totalEvents, 1);

  // ── 3. Agent-Agent health from routing_events ──
  const agentAgentHealth = computeAgentAgentHealth(db, teamId, logger);

  // ── 4. Trust decay events ──
  const decayEvents = detectTrustDecay(db, teamId, logger);

  // ── 5. Single point dependency risks ──
  const singlePointRisks = detectSinglePointRisks(db, teamId, logger);

  // ── 6. Overall trust health ──
  const trustHealthScore = Math.round(
    (autoAcceptRate * 0.4 + (1 - escalationRate) * 0.3 + (1 - deadlockRate) * 0.2 + agentAgentHealth * 0.1) * 100,
  ) / 100;

  const trend = autoAcceptRate > 0.6
    ? 'improving' : escalationRate > 0.3
    ? 'declining' : 'stable';

  return {
    trustCurves,
    autoAcceptRate: Math.round(autoAcceptRate * 100) / 100,
    escalationRate: Math.round(escalationRate * 100) / 100,
    agentAgentHealth: Math.round(agentAgentHealth * 100) / 100,
    trustHealthScore,
    trend,
    decayEvents,
    singlePointRisks,
    interpretation: buildInterpretation(
      trustHealthScore, autoAcceptRate, escalationRate,
      decayEvents, singlePointRisks,
    ),
  };
}

// ====================================================================
// Internal: Trust curves
// ====================================================================

function computeTrustCurves(
  db: any, teamId: string, logger: any,
): TrustCurve[] {
  const curves: TrustCurve[] = [];

  try {
    if (!db) return curves;

    // Get daily HITL correction counts for recent 30 days
    const rows = db.prepare(`
      SELECT date(created_at) as day,
             SUM(CASE WHEN event_type = 'hitl_correction' OR status = 'corrected' THEN 1 ELSE 0 END) as corrections,
             SUM(CASE WHEN event_type = 'auto_accept' OR status = 'completed' THEN 1 ELSE 0 END) as auto_accepts,
             COUNT(*) as total
      FROM collaboration_events
      WHERE created_at >= date('now', '-30 days')
      GROUP BY day
      ORDER BY day
    `).all() as Array<{ day: string; corrections: number; auto_accepts: number; total: number }>;

    if (rows.length < 3) return curves;

    for (const row of rows) {
      if (row.total === 0) continue;
      curves.push({
        date: row.day,
        correctionRate: Math.round((row.corrections / row.total) * 100) / 100,
        autoAcceptRate: Math.round((row.auto_accepts / row.total) * 100) / 100,
        sampleSize: row.total,
      });
    }
  } catch (err) {
    logger.warn({ err, teamId }, '[htm] 信任曲线计算失败');
  }

  return curves;
}

// ====================================================================
// Internal: Agent-Agent health
// ====================================================================

function computeAgentAgentHealth(
  db: any, teamId: string, logger: any,
): number {
  try {
    if (!db) return 0.7; // default: moderate health

    // Average error rate across all agents from agent_metrics
    const rows = db.prepare(`
      SELECT agent_id,
             SUM(tasks_completed) as completed,
             SUM(tasks_failed) as failed
      FROM agent_metrics
      WHERE date >= date('now', '-30 days')
      GROUP BY agent_id
    `).all() as Array<{ agent_id: string; completed: number; failed: number }>;

    if (rows.length === 0) return 0.7;

    let totalFailRate = 0;
    let agentCount = 0;
    for (const row of rows) {
      const total = row.completed + row.failed;
      if (total > 0) {
        totalFailRate += row.failed / total;
        agentCount++;
      }
    }

    if (agentCount === 0) return 0.7;
    const avgFailRate = totalFailRate / agentCount;
    return Math.max(0, Math.round((1 - avgFailRate * 2) * 100) / 100);
  } catch (err) {
    logger.warn({ err, teamId }, '[htm] Agent-Agent健康度计算失败');
    return 0.7;
  }
}

// ====================================================================
// Internal: Trust decay detection
// ====================================================================

function detectTrustDecay(
  db: any, teamId: string, logger: any,
): TrustDecayEvent[] {
  const events: TrustDecayEvent[] = [];

  try {
    if (!db) return events;

    // Detect sudden spikes in correction rate (2x daily average)
    const rows = db.prepare(`
      SELECT date(created_at) as day,
             SUM(CASE WHEN status = 'corrected' OR event_type = 'hitl_correction' THEN 1 ELSE 0 END) as corrections,
             COUNT(*) as total
      FROM collaboration_events
      WHERE created_at >= date('now', '-30 days')
      GROUP BY day
      ORDER BY day
    `).all() as Array<{ day: string; corrections: number; total: number }>;

    if (rows.length < 5) return events;

    const avgCorrectionRate = rows.reduce((s, r) =>
      s + (r.total > 0 ? r.corrections / r.total : 0), 0) / rows.length;

    for (const row of rows) {
      if (row.total < 3) continue;
      const rate = row.corrections / row.total;
      if (rate > avgCorrectionRate * 2 && avgCorrectionRate > 0) {
        events.push({
          date: row.day,
          correctionRate: Math.round(rate * 100) / 100,
          baselineRate: Math.round(avgCorrectionRate * 100) / 100,
          severity: rate > avgCorrectionRate * 5 ? 'critical' : 'moderate',
          possibleTrigger: rate > avgCorrectionRate * 5
            ? '可能发生重大错误导致信任骤降'
            : '修正频率升高，信任出现波动',
        });
      }
    }
  } catch (err) {
    logger.warn({ err, teamId }, '[htm] 信任衰减检测失败');
  }

  return events;
}

// ====================================================================
// Internal: Single point risk detection
// ====================================================================

function detectSinglePointRisks(
  db: any, teamId: string, logger: any,
): SinglePointRisk[] {
  const risks: SinglePointRisk[] = [];

  try {
    if (!db) return risks;

    // Find agents with high dependency: agents that are the sole target
    // of many routing events (no fallback)
    const rows = db.prepare(`
      SELECT to_role as agent_id, COUNT(*) as route_count
      FROM routing_events
      WHERE team_id = ?
        AND created_at >= date('now', '-30 days')
      GROUP BY to_role
      HAVING route_count > 10
      ORDER BY route_count DESC
      LIMIT 5
    `).all(teamId) as Array<{ agent_id: string; route_count: number }>;

    if (rows.length === 0) return risks;

    const totalRoutes = rows.reduce((s, r) => s + r.route_count, 0);
    for (const row of rows) {
      const concentration = row.route_count / Math.max(totalRoutes, 1);
      if (concentration > 0.3) {
        risks.push({
          agentId: row.agent_id,
          dependencyConcentration: Math.round(concentration * 100) / 100,
          routeCount: row.route_count,
          risk: concentration > 0.6 ? 'critical'
            : concentration > 0.4 ? 'high' : 'moderate',
        });
      }
    }
  } catch (err) {
    logger.warn({ err, teamId }, '[htm] 单点风险检测失败');
  }

  return risks;
}

// ====================================================================
// Internal: Interpretation
// ====================================================================

function buildInterpretation(
  trustScore: number, autoAcceptRate: number, escalationRate: number,
  decayEvents: TrustDecayEvent[], singlePointRisks: SinglePointRisk[],
): string {
  const parts: string[] = [];

  parts.push(`整体信任健康度 ${(trustScore * 100).toFixed(0)}%。`);

  if (autoAcceptRate > 0.7) {
    parts.push('人对 Agent 的自动接受率较高，信任关系良好。');
  } else if (autoAcceptRate < 0.3) {
    parts.push('人对 Agent 的自动接受率偏低，可能存在信任不足。');
  }

  if (escalationRate > 0.3) {
    parts.push(`升级率 ${(escalationRate * 100).toFixed(0)}%，频繁升级可能表明信任机制未校准。`);
  }

  if (decayEvents.length > 0) {
    const critical = decayEvents.filter(e => e.severity === 'critical').length;
    parts.push(`检测到 ${decayEvents.length} 次信任衰减事件` +
      (critical > 0 ? `（含 ${critical} 次严重事件）` : '') + '。');
  }

  if (singlePointRisks.length > 0) {
    const agents = singlePointRisks.map(r => r.agentId).join('、');
    parts.push(`路由单点依赖风险：${agents}。`);
  }

  return parts.join('');
}
