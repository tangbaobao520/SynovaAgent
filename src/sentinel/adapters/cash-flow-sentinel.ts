/**
 * sentinel/adapters/cash-flow-sentinel.ts — 现金流哨兵 (D1)
 * @state: real
 *
 * 从 SOG 图中提取现金流数据：FINANCIAL节点(含cash_flow/cashflow/runway属性) + DOCUMENT(提取:finance维度)。
 * 支持人工汇报（日报/周报）。每日9:00巡检。
 */

import type { Sentinel, SentinelCheckResult, SentinelConfig, SentinelContext, SentinelFinding } from '../types';
import { discoverTeams } from './helpers';
import { createLogger } from '../../logger';

const log = createLogger('sentinel/cashflow');

const config: SentinelConfig = {
  id: 'sentinel-cash-flow', name: '现金流', description: '现金流预测/跑道/应收逾期。数据源: SOG图(人工汇报)。', category: 'risk', priority: 'P0', mode: 'cron', cron: '0 9 * * *', requiredDataSources: ['sog_graph'], confidenceModel: 'statistical', version: '1.0.0',
};

export const cashFlowSentinel: Sentinel = {
  config,
  async check(context: SentinelContext): Promise<SentinelCheckResult> {
    const { now } = context; const checkedAt = now.toISOString(); const startTime = Date.now();
    try {
      const teams = discoverTeams(context);
      const db = context.db as { prepare(sql: string): { all(): Array<Record<string, unknown>> } } | null;
      const allFindings: SentinelFinding[] = []; let anyData = false;
      for (const teamId of teams) {
        let totalCash = 0; let monthlyBurn = 0; let overdue = 0;
        if (db) {
          try { const rows = db.prepare("SELECT props FROM graph_nodes WHERE type = 'FINANCIAL' AND props IS NOT NULL").all(); for (const r of rows) { const p = typeof r.props === 'string' ? JSON.parse(r.props as string) : (r.props || {}); const cf = Number(p.cash_flow) || Number(p.cashflow) || 0; totalCash += (p.cash || p.balance || p.现金 || 0) as number; monthlyBurn += (p.burn_rate || p.monthly_burn || p.月支出 || 0) as number; overdue += (p.overdue || p.receivable_overdue || p.应收账款逾期 || 0) as number; if (cf > 0 || totalCash > 0) anyData = true; } } catch { /* */ }
        }
        if (!anyData) continue;
        const runwayMonths = monthlyBurn > 0 ? totalCash / monthlyBurn : (totalCash > 0 ? Infinity : 0);
        if (runwayMonths < 3 && runwayMonths > 0) { allFindings.push({ id: `cf-runway-${teamId}-${now.getTime()}`, severity: 'critical', title: `现金流跑道不足 ${runwayMonths.toFixed(1)} 个月`, description: `现金余额${totalCash}，月烧钱${monthlyBurn}。跑道<3个月，需紧急融资/节流。`, evidence: [`现金: ${totalCash}`, `月支出: ${monthlyBurn}`, `跑道: ${runwayMonths.toFixed(1)}月`], suggestion: '启动应急融资，削减非必要支出，加速应收回收。', detectedAt: checkedAt }); }
        else if (runwayMonths < 6 && runwayMonths > 0) { allFindings.push({ id: `cf-runway-${teamId}-${now.getTime()}`, severity: 'warning', title: `现金流跑道偏低 ${runwayMonths.toFixed(1)} 个月`, description: `跑道<6个月，建议提前准备融资。`, evidence: [`现金: ${totalCash}`, `月支出: ${monthlyBurn}`, `跑道: ${runwayMonths.toFixed(1)}月`], suggestion: '准备融资材料，评估节流方案。', detectedAt: checkedAt }); }
        if (overdue > 0 && totalCash > 0 && overdue / totalCash > 0.3) { allFindings.push({ id: `cf-overdue-${teamId}-${now.getTime()}`, severity: 'warning', title: `应收账款逾期过高 (${overdue})`, description: `逾期应收占总现金${((overdue/totalCash)*100).toFixed(0)}%。`, evidence: [`逾期: ${overdue}`, `现金: ${totalCash}`], suggestion: '加强催收流程，评估客户信用。', detectedAt: checkedAt }); }
      }
      if (!anyData) return { sentinelId: config.id, ok: true, findings: [], durationMs: Date.now() - startTime, checkedAt, degraded: true };
      return { sentinelId: config.id, ok: true, findings: allFindings, durationMs: Date.now() - startTime, checkedAt, degraded: false };
    } catch (err: unknown) { return { sentinelId: config.id, ok: false, findings: [], durationMs: Date.now() - startTime, checkedAt, error: (err as Error)?.message || String(err), degraded: true }; }
  },
};
