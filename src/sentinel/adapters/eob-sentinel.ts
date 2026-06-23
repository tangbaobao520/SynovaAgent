/**
 * sentinel/adapters/eob-sentinel.ts — 组织弹性边界哨兵 (D3)
 * @state: real — 2026-06-18 Week 4: 增强 finding 提取
 *
 * 包装 computeEOB()，监测 Agent 流失率、弹性扩展延迟、僵尸权限、边界健康。
 * 每周二 9:00 巡检。
 */

import type { Sentinel, SentinelCheckResult, SentinelConfig, SentinelContext, SentinelFinding } from '../types';
import { swapDbForContext, discoverTeams, checkTeam } from './helpers';
import { createLogger } from '../../logger';

const log = createLogger('sentinel/eob');

const config: SentinelConfig = {
  id: 'sentinel-eob', name: '组织弹性边界 (EOB)',
  description: '监测 Agent 流失率、弹性扩展延迟、僵尸权限、边界健康度。每周二巡检。',
  category: 'capability', priority: 'P1', mode: 'cron', cron: '0 9 * * 2',
  requiredDataSources: ['team_changes', 'routing_events', 'agent_contracts'],
  confidenceModel: 'deterministic', version: '2.0.0',
};

interface EOBReport {
  churnRate: number; scaleLatencyHours: number | null; externalRatio: number;
  zombiePermissions: string[]; boundaryHealth: number; interpretation: string;
}

function extractFindings(report: EOBReport, now: Date): SentinelFinding[] {
  const f: SentinelFinding[] = []; const ts = now.toISOString();

  // 1. Agent 流失率
  if (report.churnRate > 0.3) {
    f.push({ id: `eob-churn-critical-${now.getTime()}`, severity: 'critical',
      title: `Agent 流失率严重 (${(report.churnRate * 100).toFixed(0)}%)`,
      description: `超过 30%——组织弹性边界可能已破裂。${report.interpretation}`,
      evidence: [`流失率: ${(report.churnRate * 100).toFixed(0)}%`, `边界健康: ${(report.boundaryHealth * 100).toFixed(0)}%`, `外部比率: ${(report.externalRatio * 100).toFixed(0)}%`],
      suggestion: '立即审查 Agent 增删事件——确认是正常轮换还是系统性流失。', detectedAt: ts });
  } else if (report.churnRate > 0.2) {
    f.push({ id: `eob-churn-warn-${now.getTime()}`, severity: 'warning',
      title: `Agent 流失率偏高 (${(report.churnRate * 100).toFixed(0)}%)`,
      description: `超过 20% 警戒线。${report.interpretation}`,
      evidence: [`流失率: ${(report.churnRate * 100).toFixed(0)}%`, `边界健康: ${(report.boundaryHealth * 100).toFixed(0)}%`],
      suggestion: '审查最近 30 天 Agent 增删——确认是否有异常的团队重组。', detectedAt: ts });
  }

  // 2. 弹性扩展延迟
  if (report.scaleLatencyHours !== null && report.scaleLatencyHours > 8) {
    f.push({ id: `eob-latency-critical-${now.getTime()}`, severity: 'critical',
      title: `弹性扩展严重延迟 (${report.scaleLatencyHours.toFixed(1)}h)`,
      description: `超过 8 小时——工作负载高峰期 Agent 无法及时扩展。`,
      evidence: [`扩展延迟: ${report.scaleLatencyHours.toFixed(1)}h`, `外部比率: ${(report.externalRatio * 100).toFixed(0)}%`],
      suggestion: '缩短 Agent 部署审批流程，预置备用 Agent 实例池。', detectedAt: ts });
  } else if (report.scaleLatencyHours !== null && report.scaleLatencyHours > 4) {
    f.push({ id: `eob-latency-warn-${now.getTime()}`, severity: 'warning',
      title: `弹性扩展延迟 (${report.scaleLatencyHours.toFixed(1)}h)`,
      description: `超过 4h 警戒线——可能影响高峰期的服务质量。`,
      evidence: [`扩展延迟: ${report.scaleLatencyHours.toFixed(1)}h`, `外部比率: ${(report.externalRatio * 100).toFixed(0)}%`],
      suggestion: '缩短部署审批流程或预置备用 Agent 实例。', detectedAt: ts });
  }

  // 3. 僵尸权限
  if (report.zombiePermissions.length > 5) {
    f.push({ id: `eob-zombie-critical-${now.getTime()}`, severity: 'critical',
      title: `${report.zombiePermissions.length} 个僵尸权限——安全风险`,
      description: `以下 Agent 合同有权限但近期无活跃: ${report.zombiePermissions.slice(0, 5).join(', ')}${report.zombiePermissions.length > 5 ? `... 等 ${report.zombiePermissions.length} 个` : ''}`,
      evidence: report.zombiePermissions.slice(0, 5).map(z => `僵尸: ${z}`),
      suggestion: '立即回收僵尸权限——每个未回收的权限都是攻击面。', detectedAt: ts });
  } else if (report.zombiePermissions.length > 0) {
    f.push({ id: `eob-zombie-warn-${now.getTime()}`, severity: 'warning',
      title: `${report.zombiePermissions.length} 个僵尸权限`,
      description: `以下权限近期无活跃记录: ${report.zombiePermissions.join(', ')}`,
      evidence: report.zombiePermissions.map(z => `僵尸权限: ${z}`),
      suggestion: '回收或确认这些权限是否仍需要。', detectedAt: ts });
  }

  // 4. 边界健康偏低
  if (report.boundaryHealth < 0.3 && f.length === 0) {
    f.push({ id: `eob-health-low-${now.getTime()}`, severity: 'warning',
      title: `组织边界健康严重偏低 (${(report.boundaryHealth * 100).toFixed(0)}%)`,
      description: report.interpretation,
      evidence: [`边界健康: ${(report.boundaryHealth * 100).toFixed(0)}%`, `流失率: ${(report.churnRate * 100).toFixed(0)}%`],
      suggestion: '综合审查 Agent 生命周期管理——流失、扩展、权限三方面。', detectedAt: ts });
  }

  // 5. 健康
  if (f.length === 0) {
    f.push({ id: `eob-healthy-${now.getTime()}`, severity: 'info',
      title: `组织弹性边界健康 (${(report.boundaryHealth * 100).toFixed(0)}%)`,
      description: `流失率 ${(report.churnRate * 100).toFixed(0)}%，扩展延迟 ${report.scaleLatencyHours?.toFixed(1) ?? 'N/A'}h，0 僵尸权限。`,
      evidence: [`边界健康: ${(report.boundaryHealth * 100).toFixed(0)}%`, `流失率: ${(report.churnRate * 100).toFixed(0)}%`],
      suggestion: '维持当前弹性策略。', detectedAt: ts });
  }

  return f;
}

export const eobSentinel: Sentinel = {
  config,
  async check(context: SentinelContext): Promise<SentinelCheckResult> {
    const restore = swapDbForContext(context); const { now } = context;
    try {
      const teams = discoverTeams(context);
      const mod = await import('../../sentinel/compute/eob') as unknown as { computeEOB(t: string): EOBReport | null };
      const allFindings: SentinelFinding[] = []; let anyFailed = false, anyData = false; const errors: string[] = [];
      for (const tid of teams) {
        const r = await checkTeam(config.id, tid, now, (t) => mod.computeEOB(t), (rep) => extractFindings(rep as EOBReport, now), 'EOB');
        if (!r.ok) { anyFailed = true; if (r.error) errors.push(r.error); }
        if (r.findings.length > 0) anyData = true;
        allFindings.push(...r.findings);
      }
      return { sentinelId: config.id, ok: !anyFailed, findings: allFindings, durationMs: Date.now() - now.getTime(), checkedAt: now.toISOString(), error: anyFailed ? errors.join('; ') : undefined, degraded: (!anyData && teams.length > 0) || (anyFailed && allFindings.length === 0) };
    } catch (err: unknown) {
      const msg = (err as Error)?.message || String(err);
      log.error({ err: msg, code: 'EOB_SENTINEL_CRASH', phase: 3, retryable: true }, '[EOB] 哨兵崩溃');
      return { sentinelId: config.id, ok: false, findings: [], durationMs: Date.now() - now.getTime(), checkedAt: now.toISOString(), error: msg, degraded: true };
    } finally { restore(); }
  },
};
