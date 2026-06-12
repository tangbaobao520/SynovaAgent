/**
 * sentinel/adapters/token-economics-sentinel.ts — 单位经济学哨兵 (D1)
 * @state: real
 *
 * 包装 computeTokenEconomics()，监测 LLM Token 成本结构和利润率。
 * 每周一 9:00 巡检。
 */

import type { Sentinel, SentinelCheckResult, SentinelConfig, SentinelContext, SentinelFinding } from '../types';
import { swapDbForContext, discoverTeams, checkTeam } from './helpers';
import { createLogger } from '../../logger';

const log = createLogger('sentinel/token-econ');

const config: SentinelConfig = {
  id: 'sentinel-token-economics', name: '单位经济学 (Token)', description: '监测 LLM Token 成本、利润率、投入产出比。', category: 'capability', priority: 'P2', mode: 'cron', cron: '0 9 * * 1', requiredDataSources: ['financial_nodes'], confidenceModel: 'deterministic', version: '1.0.0',
};

interface TokenEconReport {
  teamId: string; totalTokenCost: number; tokenCostPerDiagnosis: number;
  marginEstimate: number; costEfficiencyScore: number;
  trend: 'improving' | 'stable' | 'declining'; interpretation: string;
}

function extractFindings(report: TokenEconReport, now: Date): SentinelFinding[] {
  const f: SentinelFinding[] = []; const ts = now.toISOString();
  if (report.costEfficiencyScore < 0.4) {
    f.push({ id: `te-high-cost-${now.getTime()}`, severity: 'warning', title: `Token 成本效率偏低 (${(report.costEfficiencyScore * 100).toFixed(0)}%)`, description: `单次诊断 Token 成本: $${report.tokenCostPerDiagnosis.toFixed(4)}。${report.interpretation}`, evidence: [`总成本: $${report.totalTokenCost.toFixed(2)}`, `单次诊断成本: $${report.tokenCostPerDiagnosis.toFixed(4)}`, `利润率估算: ${(report.marginEstimate * 100).toFixed(0)}%`], suggestion: '审查 LLM 调用链路——是否存在冗余调用或过长的 prompt。', detectedAt: ts });
  }
  if (report.trend === 'declining') {
    f.push({ id: `te-trend-down-${now.getTime()}`, severity: 'info', title: 'Token 成本呈上升趋势', description: report.interpretation, evidence: [`趋势: ${report.trend}`], suggestion: '监测未来 2 周——如持续上升，需审查模型选择或 prompt 长度。', detectedAt: ts });
  }
  return f;
}

export const tokenEconomicsSentinel: Sentinel = {
  config,
  async check(context: SentinelContext): Promise<SentinelCheckResult> {
    const restore = swapDbForContext(context); const { now } = context;
    try {
      const teams = discoverTeams(context);
      const mod = await import('../../../packages/engine-core/src/pipeline/diagnosis/token-economics') as unknown as { computeTokenEconomics(t: string, b?: any, n?: any): TokenEconReport | null };
      const allFindings: SentinelFinding[] = []; let anyFailed = false, anyData = false; const errors: string[] = [];
      for (const tid of teams) {
        const r = await checkTeam(config.id, tid, now, (t) => mod.computeTokenEconomics(t), (rep) => extractFindings(rep as TokenEconReport, now), 'TokenEcon');
        if (!r.ok) { anyFailed = true; if (r.error) errors.push(r.error); }
        if (r.findings.length > 0) anyData = true;
        allFindings.push(...r.findings);
      }
      return { sentinelId: config.id, ok: !anyFailed, findings: allFindings, durationMs: Date.now() - now.getTime(), checkedAt: now.toISOString(), error: anyFailed ? errors.join('; ') : undefined, degraded: (!anyData && teams.length > 0) || (anyFailed && allFindings.length === 0) };
    } catch (err: unknown) {
      return { sentinelId: config.id, ok: false, findings: [], durationMs: 0, checkedAt: now.toISOString(), error: (err as Error)?.message || String(err), degraded: true };
    } finally { restore(); }
  },
};
