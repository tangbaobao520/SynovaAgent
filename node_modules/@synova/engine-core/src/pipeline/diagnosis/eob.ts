/**
 * diagnosis/eob.ts — 组织弹性边界 (Elastic Organizational Boundary, ARCH-06 #18)
 *
 * 诊断人+Agent 混合组织的动态边界管理能力。
 * 纯计算模块：消费 team_changes / routing_events / agent_contracts 表。
 *
 * 核心信号：
 *   1. Agent 流失率 — remove_role 频率
 *   2. 弹性响应速度 — 任务激增到新 Agent 上线的时间间隔
 *   3. 外部比例 — external_interface 使用比例
 *   4. 僵尸权限风险 — 已删除 Agent 的残留合约
 */

import type { EOBReport } from './types';
import { getEngineContext } from '../../engine-context';
import { getLatestSnapshot } from './gap-recorder';
import { createLogger } from '../../infra/logger';

const log = createLogger('engine-server/pipeline/diagnosis/eob');

// ====================================================================
// DB access helper
// ====================================================================

function getDb(): any | null {
  try { return getEngineContext().database.getDb(); } catch { log.debug('[eob] database not available via engine context'); return null; }
}

// ====================================================================
// Public API
// ====================================================================

/**
 * Compute Elastic Organizational Boundary report for a team.
 * Returns null if insufficient data.
 */
export function computeEOB(teamId: string): EOBReport | null {
  const logger = getEngineContext().logger;
  const db = getDb();

  if (!db) return null;

  // ── 1. Agent churn rate from team_changes ──
  const churnRate = computeChurnRate(db, teamId, logger);

  // ── 2. Elastic response speed ──
  const scaleLatencyHours = computeScaleLatency(db, teamId, logger);

  // ── 3. External agent ratio from external_interface gap ──
  const externalRatio = computeExternalRatio(teamId);

  // ── 4. Zombie permission detection ──
  const zombiePermissions = detectZombiePermissions(db, teamId, logger);

  // ── 5. Boundary health score ──
  const zombieRisk = zombiePermissions.length > 0
    ? Math.min(1, zombiePermissions.length / 5) : 0;
  const latencyRisk = scaleLatencyHours !== null && scaleLatencyHours > 2
    ? Math.min(1, scaleLatencyHours / 8) : 0;
  const boundaryHealth = Math.round(
    (1 - churnRate * 2 - zombieRisk * 0.3 - latencyRisk * 0.3) * 100,
  ) / 100;

  return {
    churnRate: Math.round(churnRate * 100) / 100,
    scaleLatencyHours,
    externalRatio: Math.round(externalRatio * 100) / 100,
    zombiePermissions,
    boundaryHealth: Math.max(0, boundaryHealth),
    interpretation: buildInterpretation(
      churnRate, scaleLatencyHours, externalRatio, zombiePermissions,
    ),
  };
}

// ====================================================================
// Internal: Agent churn rate
// ====================================================================

function computeChurnRate(
  db: any, teamId: string, logger: any,
): number {
  try {
    // Count add_role and remove_role events in the last 30 days
    const row = db.prepare(`
      SELECT
        SUM(CASE WHEN action_type = 'add_role' THEN 1 ELSE 0 END) as adds,
        SUM(CASE WHEN action_type = 'remove_role' THEN 1 ELSE 0 END) as removes,
        MAX(created_at) as latest
      FROM team_changes
      WHERE team_id = ?
        AND created_at >= datetime('now', '-30 days')
    `).get(teamId) as { adds: number | null; removes: number | null; latest: string | null };

    if (!row || !row.latest) return 0;

    const adds = row.adds ?? 0;
    const removes = row.removes ?? 0;
    // Churn rate = (adds + removes) / 2 per month, capped at 1
    return Math.min(1, (adds + removes) / 2 / 10);
  } catch (err) {
    logger.warn({ err, teamId }, '[eob] 流失率计算失败');
    return 0;
  }
}

// ====================================================================
// Internal: Elastic scale latency
// ====================================================================

function computeScaleLatency(
  db: any, teamId: string, logger: any,
): number | null {
  try {
    // Find pairs of (spike in routing_events, first subsequent add_role)
    // Simplified: average time between routing spike and next add_role
    const rows = db.prepare(`
      SELECT r.created_at as spike_time,
             (SELECT MIN(tc.created_at)
              FROM team_changes tc
              WHERE tc.team_id = r.team_id
                AND tc.action_type = 'add_role'
                AND tc.created_at > r.created_at
                AND tc.created_at < datetime(r.created_at, '+7 days')
             ) as response_time
      FROM routing_events r
      WHERE r.team_id = ?
        AND r.created_at >= datetime('now', '-30 days')
        AND r.load_snapshot IS NOT NULL
      ORDER BY r.created_at DESC
      LIMIT 10
    `).all(teamId) as Array<{ spike_time: string; response_time: string | null }>;

    let totalLatencyHours = 0;
    let count = 0;
    for (const row of rows) {
      if (row.response_time) {
        const spike = new Date(row.spike_time).getTime();
        const response = new Date(row.response_time).getTime();
        const hours = (response - spike) / 3600000;
        if (hours > 0 && hours < 168) { // within 7 days
          totalLatencyHours += hours;
          count++;
        }
      }
    }

    return count > 0 ? Math.round((totalLatencyHours / count) * 100) / 100 : null;
  } catch (err) {
    logger.warn({ err, teamId }, '[eob] 弹性响应速度计算失败');
    return null;
  }
}

// ====================================================================
// Internal: External agent ratio
// ====================================================================

function computeExternalRatio(teamId: string): number {
  try {
    const snapshot = getLatestSnapshot(teamId);
    const extGap = snapshot?.gaps?.external_interface;
    if (!extGap) return 0;

    // external_interface engineScore inversely correlates with external dependency
    // Lower score = more external dependency
    if (typeof extGap.engineScore === 'number') {
      return Math.round(Math.max(0, (10 - extGap.engineScore) / 20) * 100) / 100;
    }
    return 0;
  } catch {
    log.debug('[eob] external ratio computation failed, defaulting to 0');
    return 0;
  }
}

// ====================================================================
// Internal: Zombie permission detection
// ====================================================================

function detectZombiePermissions(
  db: any, teamId: string, logger: any,
): string[] {
  const zombies: string[] = [];

  try {
    // Find agents with contracts but no recent team_changes presence
    const rows = db.prepare(`
      SELECT ac.agent_id, ac.updated_at as contract_updated,
             MAX(tc.created_at) as last_change
      FROM agent_contracts ac
      LEFT JOIN team_changes tc
        ON tc.action_detail LIKE '%' || ac.agent_id || '%'
         AND tc.team_id = ?
      WHERE ac.updated_at < datetime('now', '-30 days')
      GROUP BY ac.agent_id
      HAVING last_change IS NULL
          OR last_change < datetime('now', '-30 days')
    `).all(teamId) as Array<{
      agent_id: string; contract_updated: string; last_change: string | null;
    }>;

    for (const row of rows) {
      zombies.push(row.agent_id);
    }
  } catch (err) {
    logger.warn({ err, teamId }, '[eob] 僵尸权限检测失败');
  }

  return zombies;
}

// ====================================================================
// Internal: Interpretation
// ====================================================================

function buildInterpretation(
  churnRate: number, scaleLatency: number | null,
  externalRatio: number, zombiePermissions: string[],
): string {
  const parts: string[] = [];

  if (churnRate > 0.3) {
    parts.push(`Agent 月度流失率 ${(churnRate * 100).toFixed(0)}%，边界变化频繁，需关注稳定性。`);
  } else if (churnRate > 0.1) {
    parts.push(`Agent 流失率 ${(churnRate * 100).toFixed(0)}%，在正常范围内。`);
  } else {
    parts.push('Agent 边界稳定，几乎没有流失。');
  }

  if (scaleLatency !== null) {
    if (scaleLatency > 4) {
      parts.push(`弹性响应平均延迟 ${scaleLatency.toFixed(1)}h，明显偏低，建议预热机制。`);
    } else {
      parts.push(`弹性响应延迟 ${scaleLatency.toFixed(1)}h，在可接受范围。`);
    }
  } else {
    parts.push('弹性响应数据不足，无法评估。');
  }

  if (externalRatio > 0.3) {
    parts.push(`外部 Agent 使用比例 ${(externalRatio * 100).toFixed(0)}%，边界较为开放。`);
  }

  if (zombiePermissions.length > 0) {
    parts.push(`检测到 ${zombiePermissions.length} 个僵尸权限残留：${zombiePermissions.join('、')}。`);
  }

  return parts.join('');
}
