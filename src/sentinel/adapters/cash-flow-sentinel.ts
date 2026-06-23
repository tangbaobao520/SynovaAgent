/**
 * sentinel/adapters/cash-flow-sentinel.ts — 现金流哨兵 (D1)
 * @state: real — 2026-06-18 Week 3: 接线 computeFinancialSnapshot()
 *
 * 数据源: SOG FINANCIAL 节点 + diagnosis_snapshots。
 * 每日 9:00 巡检。核心 compute 逻辑委托给 financial-snapshot.ts。
 */

import type { Sentinel, SentinelCheckResult, SentinelConfig, SentinelContext, SentinelFinding } from '../types';
// compute 模块已迁移到 extensions/sentinels/ — V3.7 Batch 2
interface FinancialEntry { period: string; startDate?: string; endDate?: string; revenue?: number; cost?: number; profit?: number; cashFlow?: number; cashBalance?: number; accountsReceivable?: number; accountsPayable?: number; runway?: number; }
import { discoverTeams } from './helpers';
import { createLogger } from '../../logger';

const log = createLogger('sentinel/cashflow');

const config: SentinelConfig = {
  id: 'sentinel-cash-flow', name: '现金流', description: '现金流预测/跑道/应收逾期。数据源: SOG FINANCIAL 节点 + diagnosis_snapshots。', category: 'risk', priority: 'P0', mode: 'cron', cron: '0 9 * * *', requiredDataSources: ['sog_graph'], confidenceModel: 'statistical', version: '2.0.0',
};

export const cashFlowSentinel: Sentinel = {
  config,
  async check(context: SentinelContext): Promise<SentinelCheckResult> {
    const { now } = context; const checkedAt = now.toISOString(); const startTime = Date.now();
    try {
      const db = context.db as { prepare(sql: string): { all(): Array<Record<string, unknown>> } } | null;
      if (!db) return { sentinelId: config.id, ok: true, findings: [], durationMs: Date.now() - startTime, checkedAt, degraded: true };

      // 从 SOG FINANCIAL 节点提取财务条目
      let rawEntries: Array<Record<string, unknown>> = [];
      try {
        rawEntries = db.prepare(
          "SELECT props FROM graph_nodes WHERE type = 'FINANCIAL' AND props IS NOT NULL"
        ).all();
      } catch { /* DB 不可用 — 降级 */ }

      if (rawEntries.length === 0) {
        return { sentinelId: config.id, ok: true, findings: [], durationMs: Date.now() - startTime, checkedAt, degraded: true };
      }

      const entries: FinancialEntry[] = [];
      for (const r of rawEntries) {
        const p = typeof r.props === 'string' ? JSON.parse(r.props as string) : (r.props || {}) as Record<string, unknown>;
        entries.push({
          period: (p.period || p.月份 || now.toISOString().slice(0, 7)) as string,
          startDate: (p.start_date || p.开始日期 || '') as string,
          endDate: (p.end_date || p.结束日期 || '') as string,
          revenue: Number(p.revenue) || Number(p.收入) || 0,
          cost: Number(p.cost) || Number(p.costs) || Number(p.成本) || 0,
          operatingExpenses: Number(p.operating_expenses) || Number(p.运营支出) || 0,
          cashBalance: Number(p.cash_balance) || Number(p.cash) || Number(p.现金) || 0,
          headcount: Number(p.headcount) || Number(p.人数) || 1,
          operatingCashFlow: Number(p.operating_cash_flow) || Number(p.cashflow) || Number(p.经营现金流) || undefined,
        });
      }
      if (entries.length === 0) {
        return { sentinelId: config.id, ok: true, findings: [], durationMs: Date.now() - startTime, checkedAt, degraded: true };
      }

          description: `应收占总现金 ${((totalAR / totalCash) * 100).toFixed(0)}%，回收压力大。`,
          evidence: [`应收: ${totalAR}`, `现金: ${totalCash}`],
          suggestion: '加强催收流程，评估客户信用。', detectedAt: checkedAt,
        });
      }

      if (allFindings.length === 0 && cashFlowHealth === 'healthy') {
        allFindings.push({
          id: `cf-healthy-${now.getTime()}`, severity: 'info',
          title: '现金流健康',
          description: `跑道 ${runwayDisplay}，净利率 ${(netMargin * 100).toFixed(1)}%。`,
          evidence: [`跑道: ${runwayDisplay}`, `净利率: ${(netMargin * 100).toFixed(1)}%`],
          suggestion: '维持现状，持续监控。', detectedAt: checkedAt,
        });
      }

      return { sentinelId: config.id, ok: true, findings: allFindings, durationMs: Date.now() - startTime, checkedAt, degraded: false };
    } catch (err: unknown) {
      log.error({ err }, '[cashflow] check 失败');
      return { sentinelId: config.id, ok: false, findings: [], durationMs: Date.now() - startTime, checkedAt, error: (err as Error)?.message || String(err), degraded: true };
    }
  },
};
