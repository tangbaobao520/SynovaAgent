/**
 * sentinel/adapters/htm-sentinel.ts — 混合信任模型哨兵 (D3: 人+Agent 协作)
 *
 * 包装 engine-core 的 computeHTM()，将 HTMReport 转换为 SentinelFinding[]。
 *
 * 配置:
 *   - 每日 9:00 运行 (高频信号)
 *   - 类别: collaboration (人+Agent 协作)
 *   - 置信度: statistical (统计算法，非 LLM)
 *
 * Iron Law 24: 所有 catch 带 log.warn/error + degraded 标记
 * Iron Law 32: 错误带 .code + .phase + .retryable
 */

import type { Sentinel, SentinelCheckResult, SentinelConfig, SentinelContext, SentinelFinding } from '../types';
import { swapDbForContext, discoverTeams, checkTeam } from './helpers';
import { createLogger } from '../../logger';

const log = createLogger('sentinel/htm');

// ═══ Config ═══

const config: SentinelConfig = {
  id: 'sentinel-htm',
  name: '混合信任模型 (HTM)',
  description: '监测人+Agent 信任曲线、衰减事件、单点依赖风险。每日巡检。',
  category: 'collaboration',
  priority: 'P1',
  mode: 'cron',
  cron: '0 9 * * *',
  requiredDataSources: ['collaboration_events', 'routing_events', 'agent_metrics'],
  confidenceModel: 'statistical',
  version: '1.0.0',
};

// ═══ Sentinel ═══

export const htmSentinel: Sentinel = {
  config,

  async check(context: SentinelContext): Promise<SentinelCheckResult> {
    const restore = swapDbForContext(context);
    const now = context.now;
    const checkedAt = now.toISOString();

    try {
      const teams = discoverTeams(context);
      if (teams.length === 0) {
        return { sentinelId: config.id, ok: true, findings: [], durationMs: 0, checkedAt, degraded: true };
      }

      // 动态加载引擎模块 (CJS, 无 TS 类型)
      const htmMod = await import(
        '../../../packages/engine-core/src/pipeline/diagnosis/htm'
      ) as { computeHTM(teamId: string): HTMReport | null };

      const allFindings: SentinelFinding[] = [];
      let anyTeamHadData = false;
      let anyTeamFailed = false;
      const errors: string[] = [];

      for (const teamId of teams) {
        const result = await checkTeam(
          config.id, teamId, now,
          (tid) => htmMod.computeHTM(tid),
          (report) => extractHTMFindings(report as HTMReport, now),
          'HTM',
        );
        if (!result.ok) { anyTeamFailed = true; if (result.error) errors.push(result.error); }
        if (result.ok && result.findings.length > 0) anyTeamHadData = true;
        allFindings.push(...result.findings);
      }

      const durationMs = Date.now() - now.getTime();
      log.info({ teams: teams.length, findings: allFindings.length, durationMs },
        '[HTM] 巡检完成');

      return {
        sentinelId: config.id,
        ok: !anyTeamFailed,
        findings: allFindings,
        durationMs,
        checkedAt,
        error: anyTeamFailed ? errors.join('; ') : undefined,
        degraded: (!anyTeamHadData && teams.length > 0) || (anyTeamFailed && allFindings.length === 0),
      };
    } catch (err: unknown) {
      const msg = (err as Error)?.message || String(err);
      log.error({ err: msg, code: 'HTM_SENTINEL_CRASH', phase: 3, retryable: true },
        '[HTM] 哨兵崩溃');
      return {
        sentinelId: config.id,
        ok: false,
        findings: [],
        durationMs: Date.now() - now.getTime(),
        checkedAt,
        error: msg,
        degraded: true,
      };
    } finally {
      restore();
    }
  },
};

// ═══ Report → Finding 转换 ═══

/** engine-core 的 HTMReport (精简内联类型, 避免跨包 TS 依赖) */
interface HTMReport {
  trustCurves: Array<{ date: string; correctionRate: number; autoAcceptRate: number; sampleSize: number }>;
  autoAcceptRate: number;
  escalationRate: number;
  agentAgentHealth: number;
  trustHealthScore: number;
  trend: 'improving' | 'stable' | 'declining';
  decayEvents: Array<{ date: string; correctionRate: number; baselineRate: number; severity: 'critical' | 'moderate'; possibleTrigger: string }>;
  singlePointRisks: Array<{ agentId: string; dependencyConcentration: number; routeCount: number; risk: 'critical' | 'high' | 'moderate' }>;
  interpretation: string;
}

function extractHTMFindings(report: HTMReport, now: Date): SentinelFinding[] {
  const findings: SentinelFinding[] = [];
  const ts = now.toISOString();

  // 1. 信任健康分低于阈值 → warning
  if (report.trustHealthScore < 0.4) {
    findings.push({
      id: `htm-low-trust-${now.getTime()}`,
      severity: 'warning',
      title: `信任健康分偏低 (${(report.trustHealthScore * 100).toFixed(0)}%)`,
      description: `当前信任健康评分为 ${(report.trustHealthScore * 100).toFixed(0)}%，低于 40% 警戒线。趋势: ${report.trend}。${report.interpretation || ''}`,
      evidence: [
        `自动接受率: ${(report.autoAcceptRate * 100).toFixed(0)}%`,
        `升级率: ${(report.escalationRate * 100).toFixed(0)}%`,
        `Agent-Agent 健康度: ${(report.agentAgentHealth * 100).toFixed(0)}%`,
      ],
      suggestion: '审查最近 7 天的 HITL 修正记录，确认是否存在系统性信任偏移。考虑调整 Agent 自主决策阈值。',
      detectedAt: ts,
    });
  }

  // 2. 信任衰减事件 → critical (每个事件一条)
  for (const event of report.decayEvents) {
    const sev = event.severity === 'critical' ? 'critical' as const : 'warning' as const;
    findings.push({
      id: `htm-decay-${event.date}-${now.getTime()}`,
      severity: sev,
      title: `信任衰减: 修正率飙升 (${(event.correctionRate * 100).toFixed(0)}%)`,
      description: `${event.date}: 修正率 ${(event.correctionRate * 100).toFixed(0)}%，基线 ${(event.baselineRate * 100).toFixed(0)}%。可能触发: ${event.possibleTrigger}`,
      evidence: [
        `当前修正率: ${(event.correctionRate * 100).toFixed(0)}%`,
        `基线修正率: ${(event.baselineRate * 100).toFixed(0)}%`,
        `严重度: ${event.severity}`,
      ],
      suggestion: '排查触发事件前后 1 小时内的 Agent 决策日志，确认是否有错误的自动操作。',
      detectedAt: ts,
    });
  }

  // 3. 单点依赖风险 → warning
  for (const risk of report.singlePointRisks) {
    const sev = risk.risk === 'critical' ? 'critical' as const : 'warning' as const;
    findings.push({
      id: `htm-spr-${risk.agentId}-${now.getTime()}`,
      severity: sev,
      title: `单点路由风险: Agent ${risk.agentId}`,
      description: `Agent ${risk.agentId} 集中了 ${(risk.dependencyConcentration * 100).toFixed(0)}% 的依赖，共 ${risk.routeCount} 条路由。风险等级: ${risk.risk}`,
      evidence: [
        `依赖集中度: ${(risk.dependencyConcentration * 100).toFixed(0)}%`,
        `路由数: ${risk.routeCount}`,
      ],
      suggestion: '为该 Agent 设置备用路由或增加冗余实例。单点故障将导致整个协作链路中断。',
      detectedAt: ts,
    });
  }

  // 4. 趋势恶化 → info (无其他发现时仍给出信号)
  if (report.trend === 'declining' && findings.length === 0) {
    findings.push({
      id: `htm-trend-down-${now.getTime()}`,
      severity: 'info',
      title: '信任模型呈下降趋势',
      description: `虽然当前指标仍在健康范围，但趋势为 ${report.trend}。建议关注后续变化。`,
      evidence: [`信任健康分: ${(report.trustHealthScore * 100).toFixed(0)}%`],
      suggestion: '连续观察 3 天，如持续下降则升级为 warning。',
      detectedAt: ts,
    });
  }

  return findings;
}
