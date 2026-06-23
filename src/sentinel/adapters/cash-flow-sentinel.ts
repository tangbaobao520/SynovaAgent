/**
 * sentinel/adapters/cash-flow-sentinel.ts — 现金流哨兵 (D1)
 * @state: real — 2026-06-18 Week 3: 接线 computeFinancialSnapshot()
 *
 * 数据源: SOG FINANCIAL 节点 + diagnosis_snapshots。
 * 每日 9:00 巡检。核心 compute 逻辑委托给 financial-snapshot.ts。
 */

import type { Sentinel, SentinelCheckResult, SentinelConfig, SentinelContext, SentinelFinding } from '../types';
import type { FinancialEntry } from '../../sentinel/compute/financial-snapshot';
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

      // 映射 SOG props → FinancialEntry (动态 import — 铁律 39)
      const { computeFinancialSnapshot } = await import(
        '../../sentinel/compute/financial-snapshot'
      );
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

      // 委托 computeFinancialSnapshot 做真实计算 (per-team)
      const teamId = (entries[0]?.period || 'default') as string;
      const snapshot = computeFinancialSnapshot({ teamId, entries });

      // 计算跑道
      const totalCash = entries.reduce((s, e) => s + (e.cashBalance || 0), 0);
      const monthlyBurn = entries.reduce((s, e) => s + (e.operatingExpenses || 0), 0) / Math.max(entries.length, 1);
      const runwayMonths = monthlyBurn > 0 ? totalCash / monthlyBurn : (totalCash > 0 ? Infinity : 0);

      // 生成 findings
      const allFindings: SentinelFinding[] = [];
      const { cashFlowHealth, netMargin, revenueYoYGrowth, grossMargin } = snapshot;

      const runwayDisplay = Number.isFinite(runwayMonths) ? `${runwayMonths.toFixed(1)} 个月` : '充足';

      if (cashFlowHealth === 'critical') {
        allFindings.push({
          id: `cf-critical-${now.getTime()}`, severity: 'critical',
          title: `现金流危急 — 跑道 ${runwayDisplay}`,
          description: `经营现金流/现金余额不足以覆盖运营支出。净利率 ${(netMargin * 100).toFixed(1)}%，毛利率 ${(grossMargin * 100).toFixed(1)}%。`,
          evidence: [`跑道: ${runwayDisplay}`, `净利率: ${(netMargin * 100).toFixed(1)}%`, `毛利率: ${(grossMargin * 100).toFixed(1)}%`],
          suggestion: '启动应急融资，削减非必要支出，加速应收回收。', detectedAt: checkedAt,
        });
      } else if (cashFlowHealth === 'tight') {
        allFindings.push({
          id: `cf-tight-${now.getTime()}`, severity: 'warning',
          title: `现金流偏紧 — 跑道 ${runwayDisplay}`,
          description: `现金流尚可维持但余量不足。${revenueYoYGrowth !== null && revenueYoYGrowth < 0 ? `营收同比下降 ${(Math.abs(revenueYoYGrowth) * 100).toFixed(0)}%。` : ''}`,
          evidence: [`跑道: ${runwayDisplay}`, `净利率: ${(netMargin * 100).toFixed(1)}%`],
          suggestion: '准备融资材料，评估节流方案。', detectedAt: checkedAt,
        });
      }

      // 应收账款逾期检查 (AR 不在 FinancialEntry 中，从原始 SOG 数据提取)
      const totalAR = rawEntries.reduce((s, r) => {
        const p = typeof r.props === 'string' ? JSON.parse(r.props as string) : (r.props || {}) as Record<string, unknown>;
        return s + (Number(p.accounts_receivable) || Number(p.receivable) || Number(p.应收账款) || 0);
      }, 0);
      if (totalAR > 0 && totalCash > 0 && totalAR / totalCash > 0.3) {
        allFindings.push({
          id: `cf-overdue-${now.getTime()}`, severity: 'warning',
          title: `应收账款占比过高 (${((totalAR / totalCash) * 100).toFixed(0)}%)`,
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
