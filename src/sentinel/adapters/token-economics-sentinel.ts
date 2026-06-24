/**
 * @deprecated 使用 extensions/sentinels/token-economics/ 替代。新功能在此目录下开发。
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
  // 成本效率
  if (report.costEfficiencyScore < 0.3) {
    f.push({ id: `te-critical-${now.getTime()}`, severity: 'critical', title: `Token 成本效率严重偏低 (${(report.costEfficiencyScore * 100).toFixed(0)}%)`, description: `单次诊断 Token 成本: $${report.tokenCostPerDiagnosis.toFixed(4)}。${report.interpretation}`, evidence: [`总成本: $${report.totalTokenCost.toFixed(2)}`, `单次诊断: $${report.tokenCostPerDiagnosis.toFixed(4)}`, `利润率: ${(report.marginEstimate * 100).toFixed(0)}%`], suggestion: '立即审查 LLM 调用链路——压缩 prompt、合并冗余调用、考虑降级到更小模型。', detectedAt: ts });
  } else if (report.costEfficiencyScore < 0.5) {
    f.push({ id: `te-high-cost-${now.getTime()}`, severity: 'warning', title: `Token 成本效率偏低 (${(report.costEfficiencyScore * 100).toFixed(0)}%)`, description: `单次诊断 Token 成本: $${report.tokenCostPerDiagnosis.toFixed(4)}。${report.interpretation}`, evidence: [`总成本: $${report.totalTokenCost.toFixed(2)}`, `单次诊断: $${report.tokenCostPerDiagnosis.toFixed(4)}`, `利润率: ${(report.marginEstimate * 100).toFixed(0)}%`], suggestion: '审查 prompt 长度和调用频率，考虑缓存策略。', detectedAt: ts });
  }
  // 趋势
  if (report.trend === 'declining') {
    f.push({ id: `te-trend-down-${now.getTime()}`, severity: 'warning', title: '单位经济学持续恶化', description: report.interpretation, evidence: [`趋势: ${report.trend}`, `效率分: ${(report.costEfficiencyScore * 100).toFixed(0)}%`], suggestion: '如连续 3 周恶化，需审查模型选择、prompt 策略或诊断频次。', detectedAt: ts });
  }
  // 健康
  if (f.length === 0 && report.costEfficiencyScore >= 0.5) {
    f.push({ id: `te-healthy-${now.getTime()}`, severity: 'info', title: `单位经济学健康 (效率 ${(report.costEfficiencyScore * 100).toFixed(0)}%)`, description: `单次诊断成本 $${report.tokenCostPerDiagnosis.toFixed(4)}，趋势 ${report.trend}。`, evidence: [`总成本: $${report.totalTokenCost.toFixed(2)}`, `利润率: ${(report.marginEstimate * 100).toFixed(0)}%`], suggestion: '维持当前策略，持续监控。', detectedAt: ts });
  }
  return f;
}

export const tokenEconomicsSentinel: Sentinel = {
  config,
  async check(context: SentinelContext): Promise<SentinelCheckResult> {
    const restore = swapDbForContext(context); const { now } = context;
    try {
      const teams = discoverTeams(context);
      const mod = await import('../../sentinel/compute/token-economics') as unknown as { computeTokenEconomics(t: string, b?: any, n?: any): TokenEconReport | null };
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
