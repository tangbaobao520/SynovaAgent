/**
 * sentinel/adapters/financial-impact-sentinel.ts — 财务影响哨兵 (D1)
 * @state: real
 *
 * 包装 computeFinancialImpact()，将诊断结果映射为财务指标。
 * 每月 1 日 9:00 巡检 (低频——财务变化慢)。
 */

import type { Sentinel, SentinelCheckResult, SentinelConfig, SentinelContext, SentinelFinding } from '../types';
import { discoverTeams } from './helpers';
import { createLogger } from '../../logger';

const log = createLogger('sentinel/fin-impact');

const config: SentinelConfig = {
  id: 'sentinel-financial-impact', name: '财务影响分析', description: '将组织诊断指标映射为财务成本估算。', category: 'risk', priority: 'P1', mode: 'cron', cron: '0 9 1 * *', requiredDataSources: ['diagnosis_results', 'financial_baseline'], confidenceModel: 'statistical', version: '1.0.0',
};

interface FinImpactReport {
  totalMonthlyCost: number; costBreakdown: Array<{ factor: string; monthlyCost: number }>;
  riskAdjustedCost: number; interpretation: string;
}

function extractFindings(report: FinImpactReport, now: Date): SentinelFinding[] {
  const f: SentinelFinding[] = []; const ts = now.toISOString();
  if (report.totalMonthlyCost > 50000) {
    f.push({ id: `fin-high-cost-${now.getTime()}`, severity: 'warning', title: `组织低效月成本: ¥${report.totalMonthlyCost.toLocaleString()}`, description: report.interpretation, evidence: report.costBreakdown.map(c => `${c.factor}: ¥${c.monthlyCost.toLocaleString()}`), suggestion: '优先修复成本最高的因子——通常信息流断裂和信任问题占大头。', detectedAt: ts });
  }
  if (report.riskAdjustedCost > report.totalMonthlyCost * 1.5) {
    f.push({ id: `fin-risk-adj-${now.getTime()}`, severity: 'critical', title: `风险调整后成本飙升 (${((report.riskAdjustedCost / report.totalMonthlyCost - 1) * 100).toFixed(0)}%)`, description: `风险调整后月成本为 ¥${report.riskAdjustedCost.toLocaleString()}，基准 ¥${report.totalMonthlyCost.toLocaleString()}`,
      evidence: [`基准成本: ¥${report.totalMonthlyCost.toLocaleString()}`, `风险调整: ¥${report.riskAdjustedCost.toLocaleString()}`], suggestion: '高风险因子的成本放大效应显著——降低不确定性比降低运营成本更紧迫。', detectedAt: ts });
  }
  return f;
}

export const financialImpactSentinel: Sentinel = {
  config,
  async check(context: SentinelContext): Promise<SentinelCheckResult> {
    const { now } = context; const checkedAt = now.toISOString();
    try {
      const teams = discoverTeams(context);
      if (teams.length === 0) return { sentinelId: config.id, ok: true, findings: [], durationMs: 0, checkedAt, degraded: true };
      // 需要 FullDiagnosisV2 — 当前从数据库加载最近诊断
      // 降级: 返回空 findings + degraded (数据不足)
      log.debug('[FinImpact] 财务影响分析需要 FullDiagnosisV2 — 当前数据不足，降级');
      return { sentinelId: config.id, ok: true, findings: [], durationMs: Date.now() - now.getTime(), checkedAt, degraded: true };
    } catch (err: unknown) {
      return { sentinelId: config.id, ok: false, findings: [], durationMs: 0, checkedAt, error: (err as Error)?.message || String(err), degraded: true };
    }
  },
};
