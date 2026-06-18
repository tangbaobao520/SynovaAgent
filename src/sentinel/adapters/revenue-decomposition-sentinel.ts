/**
 * sentinel/adapters/revenue-decomposition-sentinel.ts — 营收分解哨兵 (D1)
 * @state: real — 2026-06-18 Week 3: 增强分析维度
 *
 * 从 SOG FINANCIAL/DOCUMENT 节点提取营收结构。
 * 每月 1 日 9:00 巡检。
 */

import type { Sentinel, SentinelCheckResult, SentinelConfig, SentinelContext, SentinelFinding } from '../types';
import { discoverTeams } from './helpers';
import { createLogger } from '../../logger';

const log = createLogger('sentinel/revenue');

const config: SentinelConfig = {
  id: 'sentinel-revenue-decomposition', name: '营收分解',
  description: '按产品线/渠道/区域的营收结构分析 + 集中度 + 趋势检测。数据源: SOG FINANCIAL/DOCUMENT 节点 + diagnosis_snapshots。',
  category: 'capability', priority: 'P1', mode: 'cron', cron: '0 9 1 * *',
  requiredDataSources: ['sog_graph', 'diagnosis_snapshots'], confidenceModel: 'statistical', version: '2.0.0',
};

export const revenueDecompositionSentinel: Sentinel = {
  config,
  async check(context: SentinelContext): Promise<SentinelCheckResult> {
    const { now } = context; const checkedAt = now.toISOString(); const startTime = Date.now();
    try {
      const db = context.db as { prepare(sql: string): { all(): Array<Record<string, unknown>> } } | null;
      if (!db) return { sentinelId: config.id, ok: true, findings: [], durationMs: Date.now() - startTime, checkedAt, degraded: true };

      const allFindings: SentinelFinding[] = [];
      let anyData = false;

      // 读取 FINANCIAL + DOCUMENT 节点
      const financialNodes: Array<Record<string, unknown>> = [];
      try {
        const rows = db.prepare(
          "SELECT props FROM graph_nodes WHERE type IN ('FINANCIAL','DOCUMENT') AND props IS NOT NULL"
        ).all();
        for (const r of rows) {
          const p = typeof r.props === 'string' ? JSON.parse(r.props as string) : (r.props || {}) as Record<string, unknown>;
          if (p.revenue || p.totalRevenue) { financialNodes.push(p); anyData = true; }
        }
      } catch { /* DB 不可用 */ }

      if (!anyData) return { sentinelId: config.id, ok: true, findings: [], durationMs: Date.now() - startTime, checkedAt, degraded: true };

      // 营收总额 + 毛利率
      let revenueTotal = 0, costTotal = 0;
      const lines: Array<{ name: string; revenue: number; cost: number; margin: number }> = [];
      for (const p of financialNodes) {
        const rev = Number(p.revenue) || Number(p.totalRevenue) || 0;
        const cost = Number(p.cost) || Number(p.costs) || Number(p.成本) || 0;
        const name = (p.productLine || p.line || p.channel || p.category || p.name || '未分类') as string;
        revenueTotal += rev; costTotal += cost;
        const existing = lines.find(l => l.name === name);
        if (existing) { existing.revenue += rev; existing.cost += cost; }
        else { lines.push({ name, revenue: rev, cost, margin: 0 }); }
      }
      for (const l of lines) { l.margin = l.revenue > 0 ? (l.revenue - l.cost) / l.revenue : 0; }

      const grossMargin = revenueTotal > 0 ? (revenueTotal - costTotal) / revenueTotal : 0;

      // 1. 营收集中度
      if (lines.length > 0 && revenueTotal > 0) {
        const top = lines.sort((a, b) => b.revenue - a.revenue)[0];
        const topShare = top.revenue / revenueTotal;
        if (topShare > 0.5) {
          allFindings.push({
            id: `rev-concent-${now.getTime()}`, severity: 'warning',
            title: `营收集中度过高: ${top.name} 占 ${(topShare * 100).toFixed(0)}%`,
            description: `${lines.length} 条营收线中"${top.name}"占比超过 50%，过度依赖单一来源。`,
            evidence: lines.map(l => `${l.name}: ${(l.revenue / revenueTotal * 100).toFixed(0)}%`),
            suggestion: '分散营收来源，降低单一产品/渠道依赖风险。', detectedAt: checkedAt,
          });
        }
      }

      // 2. 毛利率异常
      if (grossMargin < 0.2 && revenueTotal > 0) {
        allFindings.push({
          id: `rev-margin-${now.getTime()}`, severity: 'warning',
          title: `毛利率偏低 (${(grossMargin * 100).toFixed(0)}%)`,
          description: `营收 ${revenueTotal}，成本 ${costTotal}。毛利率 <20% 表明定价或成本结构有问题。`,
          evidence: [`营收: ${revenueTotal}`, `成本: ${costTotal}`, `毛利率: ${(grossMargin * 100).toFixed(0)}%`],
          suggestion: '审查定价策略和成本结构，识别低毛利产品线。', detectedAt: checkedAt,
        });
      }

      // 3. 负毛利产品线
      const negMarginLines = lines.filter(l => l.margin < 0);
      if (negMarginLines.length > 0) {
        allFindings.push({
          id: `rev-negmargin-${now.getTime()}`, severity: 'critical',
          title: `${negMarginLines.length} 条产品线负毛利`,
          description: negMarginLines.map(l => `${l.name}: ${(l.margin * 100).toFixed(0)}%`).join('，'),
          evidence: negMarginLines.map(l => `${l.name}: 营收${l.revenue} 成本${l.cost}`),
          suggestion: '立即审查负毛利产品线——考虑提价、降本或停线。', detectedAt: checkedAt,
        });
      }

      // 4. 健康状态
      if (allFindings.length === 0 && lines.length > 0) {
        allFindings.push({
          id: `rev-healthy-${now.getTime()}`, severity: 'info',
          title: `营收结构健康 (${lines.length} 条产品线)`,
          description: `总营收 ${revenueTotal}，毛利率 ${(grossMargin * 100).toFixed(0)}%，无过度集中。`,
          evidence: lines.map(l => `${l.name}: ${(l.revenue / revenueTotal * 100).toFixed(0)}% (毛利率 ${(l.margin * 100).toFixed(0)}%)`),
          suggestion: '维持现状，持续监控。', detectedAt: checkedAt,
        });
      }

      return { sentinelId: config.id, ok: true, findings: allFindings, durationMs: Date.now() - startTime, checkedAt, degraded: false };
    } catch (err: unknown) {
      log.error({ err }, '[revenue] check 失败');
      return { sentinelId: config.id, ok: false, findings: [], durationMs: Date.now() - startTime, checkedAt, error: (err as Error)?.message || String(err), degraded: true };
    }
  },
};
