/**
 * sentinel/adapters/hacd-sentinel.ts — 人机协作深度哨兵 (D3)
 *
 * 包装 computeHACD()，监测协作深度等级和 HITL 比率。
 * 每日巡检 (高频信号)。
 */

import type { Sentinel, SentinelCheckResult, SentinelConfig, SentinelContext, SentinelFinding } from '../types';
import { swapDbForContext, discoverTeams, checkTeam } from './helpers';
import { createLogger } from '../../logger';

const log = createLogger('sentinel/hacd');

const config: SentinelConfig = {
  id: 'sentinel-hacd',
  name: '人机协作深度 (HACD)',
  description: '监测混合团队的协作自主化程度 — L0~L4 等级 + HITL 比率。',
  category: 'collaboration',
  priority: 'P1',
  mode: 'cron',
  cron: '0 9 * * *',
  requiredDataSources: ['collaboration-collector'],
  confidenceModel: 'deterministic',
  version: '1.0.0',
};

interface HACDReport {
  level: 'L0' | 'L1' | 'L2' | 'L3' | 'L4';
  hitlRatio: number; autoRatio: number;
  trend: 'improving' | 'stable' | 'declining';
  interpretation: string;
}

function extractFindings(report: HACDReport, now: Date): SentinelFinding[] {
  const findings: SentinelFinding[] = [];
  const ts = now.toISOString();

  if (report.hitlRatio > 0.5) {
    findings.push({
      id: `hacd-high-hitl-${now.getTime()}`, severity: 'warning',
      title: `人工介入比率过高 (${(report.hitlRatio * 100).toFixed(0)}%)`,
      description: `当前 HITL 比率为 ${(report.hitlRatio * 100).toFixed(0)}%，超过 50% 警戒线。协作等级: ${report.level}。${report.interpretation}`,
      evidence: [`HITL 比率: ${(report.hitlRatio * 100).toFixed(0)}%`, `自主比率: ${(report.autoRatio * 100).toFixed(0)}%`, `协作等级: ${report.level}`],
      suggestion: '检查高频 HITL 场景，识别可自动化的工作流。降低 HITL 比率可显著提升团队吞吐量。',
      detectedAt: ts,
    });
  }

  if (report.trend === 'declining') {
    findings.push({
      id: `hacd-trend-down-${now.getTime()}`, severity: 'warning',
      title: '协作自主化趋势下降',
      description: `协作自主化程度呈下降趋势。当前等级: ${report.level}，HITL: ${(report.hitlRatio * 100).toFixed(0)}%。`,
      evidence: [`趋势: ${report.trend}`, `当前等级: ${report.level}`],
      suggestion: '审查最近 7 天是否有新引入的人工审批流程。评估 Agent 能力是否需要升级。',
      detectedAt: ts,
    });
  }

  if (report.level === 'L0' || report.level === 'L1') {
    findings.push({
      id: `hacd-low-level-${now.getTime()}`, severity: 'info',
      title: `协作自主化等级偏低 (${report.level})`,
      description: `当前协作等级为 ${report.level}。${report.interpretation}`,
      evidence: [`等级: ${report.level}`, `自主比率: ${(report.autoRatio * 100).toFixed(0)}%`],
      suggestion: '评估哪些低风险任务可以委托给 Agent，从 L1→L2 升级通常收益最大。',
      detectedAt: ts,
    });
  }

  return findings;
}

export const hacdSentinel: Sentinel = {
  config,
  async check(context: SentinelContext): Promise<SentinelCheckResult> {
    const restore = swapDbForContext(context);
    const { now } = context;
    try {
      const teams = discoverTeams(context);
      const mod = await import('../../../packages/engine-core/src/pipeline/diagnosis/hacd') as { computeHACD(t: string): HACDReport | null };
      const allFindings: SentinelFinding[] = [];
      let anyFailed = false, anyData = false;
      const errors: string[] = [];
      for (const tid of teams) {
        const r = await checkTeam(config.id, tid, now, (t) => mod.computeHACD(t), (rep) => extractFindings(rep as HACDReport, now), 'HACD');
        if (!r.ok) { anyFailed = true; if (r.error) errors.push(r.error); }
        if (r.findings.length > 0) anyData = true;
        allFindings.push(...r.findings);
      }
      return { sentinelId: config.id, ok: !anyFailed, findings: allFindings, durationMs: Date.now() - now.getTime(), checkedAt: now.toISOString(), error: anyFailed ? errors.join('; ') : undefined, degraded: (!anyData && teams.length > 0) || (anyFailed && allFindings.length === 0) };
    } catch (err: unknown) {
      const msg = (err as Error)?.message || String(err);
      log.error({ err: msg, code: 'HACD_SENTINEL_CRASH', phase: 3, retryable: true }, '[HACD] 哨兵崩溃');
      return { sentinelId: config.id, ok: false, findings: [], durationMs: Date.now() - now.getTime(), checkedAt: now.toISOString(), error: msg, degraded: true };
    } finally { restore(); }
  },
};
