/**
 * sentinel/adapters/hacd-sentinel.ts — 人机协作深度哨兵 (D3)
 * @state: real — 2026-06-18 Week 4: 增强 finding 提取
 *
 * 包装 computeHACD()，监测协作自主化程度 L0-L4 + HITL 比率。
 * 每日 9:00 巡检 (高频信号)。
 */

import type { Sentinel, SentinelCheckResult, SentinelConfig, SentinelContext, SentinelFinding } from '../types';
import { swapDbForContext, discoverTeams, checkTeam } from './helpers';
import { createLogger } from '../../logger';

const log = createLogger('sentinel/hacd');

const config: SentinelConfig = {
  id: 'sentinel-hacd', name: '人机协作深度 (HACD)',
  description: '监测混合团队的协作自主化程度 — L0~L4 等级 + HITL 比率。每日巡检。',
  category: 'collaboration', priority: 'P1', mode: 'cron', cron: '0 9 * * *',
  requiredDataSources: ['collaboration-collector'], confidenceModel: 'deterministic', version: '2.0.0',
};

interface HACDReport {
  level: 'L0' | 'L1' | 'L2' | 'L3' | 'L4'; hitlRatio: number; autoRatio: number;
  trend: 'improving' | 'stable' | 'declining'; interpretation: string;
}

function extractFindings(report: HACDReport, now: Date): SentinelFinding[] {
  const findings: SentinelFinding[] = []; const ts = now.toISOString();

  // 1. HITL 过高 → critical (>70%)
  if (report.hitlRatio > 0.7) {
    findings.push({ id: `hacd-critical-${now.getTime()}`, severity: 'critical',
      title: `人工介入严重过高 (${(report.hitlRatio * 100).toFixed(0)}%)`,
      description: `超过 70% 的决策需要人工介入——Agent 几乎没减轻负担。等级 ${report.level}。${report.interpretation}`,
      evidence: [`HITL: ${(report.hitlRatio * 100).toFixed(0)}%`, `自主: ${(report.autoRatio * 100).toFixed(0)}%`, `等级: ${report.level}`],
      suggestion: '立即审查高频 HITL 场景——识别可自动化工作流。从 L1→L2 升级通常收益最大。', detectedAt: ts });
  } else if (report.hitlRatio > 0.5) {
    findings.push({ id: `hacd-warn-${now.getTime()}`, severity: 'warning',
      title: `人工介入比率偏高 (${(report.hitlRatio * 100).toFixed(0)}%)`,
      description: `超过 50% 警戒线。协作等级 ${report.level}。${report.interpretation}`,
      evidence: [`HITL: ${(report.hitlRatio * 100).toFixed(0)}%`, `自主: ${(report.autoRatio * 100).toFixed(0)}%`, `等级: ${report.level}`],
      suggestion: '检查高频 HITL 场景，识别可自动化的工作流。', detectedAt: ts });
  }

  // 2. 趋势恶化
  if (report.trend === 'declining') {
    findings.push({ id: `hacd-trend-down-${now.getTime()}`, severity: 'warning',
      title: '协作自主化趋势下降', description: `等级 ${report.level}，HITL ${(report.hitlRatio * 100).toFixed(0)}%。`,
      evidence: [`趋势: declining`, `等级: ${report.level}`, `HITL: ${(report.hitlRatio * 100).toFixed(0)}%`],
      suggestion: '审查最近 7 天是否新增人工审批流程。评估 Agent 能力升级。', detectedAt: ts });
  }

  // 3. 低自主化
  if (report.level === 'L0' || report.level === 'L1') {
    findings.push({ id: `hacd-low-level-${now.getTime()}`, severity: 'info',
      title: `协作自主化等级偏低 (${report.level})`, description: report.interpretation,
      evidence: [`等级: ${report.level}`, `自主比率: ${(report.autoRatio * 100).toFixed(0)}%`],
      suggestion: '从 L1→L2 升级通常收益最大——评估低风险任务委托给 Agent。', detectedAt: ts });
  }

  // 4. 健康
  if (findings.length === 0) {
    findings.push({ id: `hacd-healthy-${now.getTime()}`, severity: 'info',
      title: `协作自主化健康 (${report.level}, 自主 ${(report.autoRatio * 100).toFixed(0)}%)`,
      description: `HITL ${(report.hitlRatio * 100).toFixed(0)}%，趋势 ${report.trend}。`,
      evidence: [`等级: ${report.level}`, `自主: ${(report.autoRatio * 100).toFixed(0)}%`, `HITL: ${(report.hitlRatio * 100).toFixed(0)}%`],
      suggestion: '维持当前协作策略。', detectedAt: ts });
  }

  return findings;
}

export const hacdSentinel: Sentinel = {
  config,
  async check(context: SentinelContext): Promise<SentinelCheckResult> {
    const restore = swapDbForContext(context); const { now } = context;
    try {
      const teams = discoverTeams(context);
      const mod = await import('../../../packages/engine-core/src/pipeline/diagnosis/hacd') as { computeHACD(t: string): HACDReport | null };
      const allFindings: SentinelFinding[] = []; let anyFailed = false, anyData = false; const errors: string[] = [];
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
