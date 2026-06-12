/**
 * sentinel/adapters/eob-sentinel.ts — 组织弹性边界哨兵 (D2)
 *
 * 包装 computeEOB()，监测 Agent 流失率、弹性扩展延迟、僵尸权限。
 * 每周二 9:00 巡检 (避免与周一的 capability sentinels 同时触发)。
 */

import type { Sentinel, SentinelCheckResult, SentinelConfig, SentinelContext, SentinelFinding } from '../types';
import { swapDbForContext, discoverTeams, checkTeam } from './helpers';
import { createLogger } from '../../logger';

const log = createLogger('sentinel/eob');

const config: SentinelConfig = {
  id: 'sentinel-eob', name: '组织弹性边界 (EOB)', description: '监测 Agent 流失率、弹性扩展延迟、僵尸权限。', category: 'capability', priority: 'P1', mode: 'cron', cron: '0 9 * * 2', requiredDataSources: ['team_changes', 'routing_events', 'agent_contracts'], confidenceModel: 'deterministic', version: '1.0.0',
};

interface EOBReport { churnRate: number; scaleLatencyHours: number | null; externalRatio: number; zombiePermissions: string[]; boundaryHealth: number; interpretation: string; }

function extractFindings(report: EOBReport, now: Date): SentinelFinding[] {
  const f: SentinelFinding[] = []; const ts = now.toISOString();
  if (report.churnRate > 0.2) f.push({ id: `eob-churn-${now.getTime()}`, severity: 'critical', title: `Agent 流失率偏高 (${(report.churnRate * 100).toFixed(0)}%)`, description: report.interpretation, evidence: [`流失率: ${(report.churnRate * 100).toFixed(0)}%`, `边界健康: ${(report.boundaryHealth * 100).toFixed(0)}%`], suggestion: '审查最近 30 天的 Agent 增删事件，确认是否有异常的团队重组。', detectedAt: ts });
  if (report.scaleLatencyHours !== null && report.scaleLatencyHours > 4) f.push({ id: `eob-latency-${now.getTime()}`, severity: 'warning', title: `弹性扩展延迟 (${report.scaleLatencyHours.toFixed(1)}h)`, description: `从路由峰值到新增 Agent 的延迟为 ${report.scaleLatencyHours.toFixed(1)} 小时，超过 4h 警戒线。`, evidence: [`扩展延迟: ${report.scaleLatencyHours.toFixed(1)}h`, `外部比率: ${(report.externalRatio * 100).toFixed(0)}%`], suggestion: '缩短 Agent 部署审批流程，或预置备用 Agent 实例。', detectedAt: ts });
  if (report.zombiePermissions.length > 0) f.push({ id: `eob-zombie-${now.getTime()}`, severity: 'warning', title: `${report.zombiePermissions.length} 个僵尸权限`, description: `以下 Agent 合同有权限但近期无活跃记录: ${report.zombiePermissions.join(', ')}`, evidence: report.zombiePermissions.map(z => `僵尸权限: ${z}`), suggestion: '回收僵尸权限——每个活跃权限都是攻击面。', detectedAt: ts });
  if (report.boundaryHealth < 0.5 && f.length === 0) f.push({ id: `eob-health-${now.getTime()}`, severity: 'info', title: `组织边界健康度偏低 (${(report.boundaryHealth * 100).toFixed(0)}%)`, description: report.interpretation, evidence: [`边界健康: ${(report.boundaryHealth * 100).toFixed(0)}%`], suggestion: '持续监测，如进一步恶化则升级。', detectedAt: ts });
  return f;
}

export const eobSentinel: Sentinel = {
  config,
  async check(context: SentinelContext): Promise<SentinelCheckResult> {
    const restore = swapDbForContext(context); const { now } = context;
    try {
      const teams = discoverTeams(context);
      const mod = await import('../../../packages/engine-core/src/pipeline/diagnosis/eob') as unknown as { computeEOB(t: string): EOBReport | null };
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
