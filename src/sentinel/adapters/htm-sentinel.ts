/**
 * sentinel/adapters/htm-sentinel.ts — 混合信任模型哨兵 (D3: 人+Agent)
 * @state: real — 2026-06-18 Week 4: 增强 finding 提取
 *
 * 包装 computeHTM()，监测人→Agent 信任曲线、衰减事件、单点依赖。
 * 每日 9:00 巡检 (高频信号)。
 */

import type { Sentinel, SentinelCheckResult, SentinelConfig, SentinelContext, SentinelFinding } from '../types';
import { swapDbForContext, discoverTeams, checkTeam } from './helpers';
import { createLogger } from '../../logger';

const log = createLogger('sentinel/htm');

const config: SentinelConfig = {
  id: 'sentinel-htm', name: '混合信任模型 (HTM)',
  description: '监测人+Agent 信任曲线、衰减事件、单点依赖风险。每日巡检。',
  category: 'collaboration', priority: 'P1', mode: 'cron', cron: '0 9 * * *',
  requiredDataSources: ['collaboration_events', 'routing_events', 'agent_metrics'],
  confidenceModel: 'statistical', version: '2.0.0',
};

export const htmSentinel: Sentinel = {
  config,
  async check(context: SentinelContext): Promise<SentinelCheckResult> {
    const restore = swapDbForContext(context); const now = context.now; const checkedAt = now.toISOString();
    try {
      const teams = discoverTeams(context);
      if (teams.length === 0) return { sentinelId: config.id, ok: true, findings: [], durationMs: 0, checkedAt, degraded: true };

      const htmMod = await import('../../../packages/engine-core/src/pipeline/diagnosis/htm') as { computeHTM(teamId: string): HTMReport | null };
      const allFindings: SentinelFinding[] = []; let anyTeamHadData = false, anyTeamFailed = false; const errors: string[] = [];

      for (const teamId of teams) {
        const result = await checkTeam(config.id, teamId, now, (tid) => htmMod.computeHTM(tid), (report) => extractHTMFindings(report as HTMReport, now), 'HTM');
        if (!result.ok) { anyTeamFailed = true; if (result.error) errors.push(result.error); }
        if (result.ok && result.findings.length > 0) anyTeamHadData = true;
        allFindings.push(...result.findings);
      }

      return { sentinelId: config.id, ok: !anyTeamFailed, findings: allFindings, durationMs: Date.now() - now.getTime(), checkedAt, error: anyTeamFailed ? errors.join('; ') : undefined, degraded: (!anyTeamHadData && teams.length > 0) || (anyTeamFailed && allFindings.length === 0) };
    } catch (err: unknown) {
      const msg = (err as Error)?.message || String(err);
      log.error({ err: msg, code: 'HTM_SENTINEL_CRASH', phase: 3, retryable: true }, '[HTM] 哨兵崩溃');
      return { sentinelId: config.id, ok: false, findings: [], durationMs: Date.now() - now.getTime(), checkedAt, error: msg, degraded: true };
    } finally { restore(); }
  },
};

interface HTMReport {
  trustCurves: Array<{ date: string; correctionRate: number; autoAcceptRate: number; sampleSize: number }>;
  autoAcceptRate: number; escalationRate: number; agentAgentHealth: number;
  trustHealthScore: number; trend: 'improving' | 'stable' | 'declining';
  decayEvents: Array<{ date: string; correctionRate: number; baselineRate: number; severity: 'critical' | 'moderate'; possibleTrigger: string }>;
  singlePointRisks: Array<{ agentId: string; dependencyConcentration: number; routeCount: number; risk: 'critical' | 'high' | 'moderate' }>;
  interpretation: string;
}

function extractHTMFindings(report: HTMReport, now: Date): SentinelFinding[] {
  const findings: SentinelFinding[] = []; const ts = now.toISOString();

  // 1. 信任健康分严重偏低 → critical
  if (report.trustHealthScore < 0.3) {
    findings.push({ id: `htm-critical-${now.getTime()}`, severity: 'critical',
      title: `人+Agent 信任严重缺失 (${(report.trustHealthScore * 100).toFixed(0)}%)`,
      description: `信任健康分 <30%——人对 Agent 的决策几乎不信任。趋势: ${report.trend}。${report.interpretation}`,
      evidence: [`信任分: ${(report.trustHealthScore * 100).toFixed(0)}%`, `自动接受率: ${(report.autoAcceptRate * 100).toFixed(0)}%`, `升级率: ${(report.escalationRate * 100).toFixed(0)}%`],
      suggestion: '立即审查 HITL 修正记录——是否存在系统性信任偏移。考虑调整 Agent 自主决策阈值、增加可解释性输出。', detectedAt: ts });
  } else if (report.trustHealthScore < 0.5) {
    findings.push({ id: `htm-low-trust-${now.getTime()}`, severity: 'warning',
      title: `人+Agent 信任偏低 (${(report.trustHealthScore * 100).toFixed(0)}%)`,
      description: `低于 50% 警戒线。自动接受率 ${(report.autoAcceptRate * 100).toFixed(0)}%。${report.interpretation}`,
      evidence: [`信任分: ${(report.trustHealthScore * 100).toFixed(0)}%`, `自动接受率: ${(report.autoAcceptRate * 100).toFixed(0)}%`, `升级率: ${(report.escalationRate * 100).toFixed(0)}%`, `Agent-Agent: ${(report.agentAgentHealth * 100).toFixed(0)}%`],
      suggestion: '审查最近 7 天修正记录——确认是全局趋势还是个别场景。', detectedAt: ts });
  }

  // 2. 衰减事件
  for (const event of report.decayEvents) {
    findings.push({ id: `htm-decay-${event.date}-${now.getTime()}`, severity: event.severity === 'critical' ? 'critical' : 'warning',
      title: `信任衰减: 修正率飙升 (${(event.correctionRate * 100).toFixed(0)}%)`,
      description: `${event.date}: 修正率 ${(event.correctionRate * 100).toFixed(0)}% (基线 ${(event.baselineRate * 100).toFixed(0)}%)。可能触发: ${event.possibleTrigger}`,
      evidence: [`修正率: ${(event.correctionRate * 100).toFixed(0)}%`, `基线: ${(event.baselineRate * 100).toFixed(0)}%`, `触发: ${event.possibleTrigger}`],
      suggestion: '排查触发事件前后 Agent 决策日志——确认是否有错误的自动操作。', detectedAt: ts });
  }

  // 3. 单点依赖
  for (const risk of report.singlePointRisks) {
    findings.push({ id: `htm-spr-${risk.agentId}-${now.getTime()}`, severity: risk.risk === 'critical' ? 'critical' : 'warning',
      title: `单点路由风险: Agent ${risk.agentId} (${(risk.dependencyConcentration * 100).toFixed(0)}%)`,
      description: `集中了 ${(risk.dependencyConcentration * 100).toFixed(0)}% 依赖，${risk.routeCount} 条路由。`,
      evidence: [`依赖集中度: ${(risk.dependencyConcentration * 100).toFixed(0)}%`, `路由数: ${risk.routeCount}`, `风险: ${risk.risk}`],
      suggestion: '设置备用路由或增加冗余实例——单点故障将中断整个协作链路。', detectedAt: ts });
  }

  // 4. 趋势恶化
  if (report.trend === 'declining' && findings.length === 0) {
    findings.push({ id: `htm-trend-down-${now.getTime()}`, severity: 'info',
      title: '人+Agent 信任呈下降趋势', description: `${report.interpretation}`,
      evidence: [`信任分: ${(report.trustHealthScore * 100).toFixed(0)}%`, `趋势: declining`],
      suggestion: '连续观察 3 天——如持续下降则升级为 warning。', detectedAt: ts });
  }

  // 5. 健康
  if (findings.length === 0 && report.trustHealthScore >= 0.5) {
    findings.push({ id: `htm-healthy-${now.getTime()}`, severity: 'info',
      title: `人+Agent 信任健康 (${(report.trustHealthScore * 100).toFixed(0)}%)`,
      description: `自动接受率 ${(report.autoAcceptRate * 100).toFixed(0)}%，趋势 ${report.trend}。`,
      evidence: [`信任分: ${(report.trustHealthScore * 100).toFixed(0)}%`, `自动接受: ${(report.autoAcceptRate * 100).toFixed(0)}%`, `Agent-Agent: ${(report.agentAgentHealth * 100).toFixed(0)}%`],
      suggestion: '维持当前信任策略。', detectedAt: ts });
  }

  return findings;
}
