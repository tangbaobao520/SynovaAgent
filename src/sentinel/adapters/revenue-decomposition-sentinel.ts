/**
 * sentinel/adapters/revenue-decomposition-sentinel.ts — 营收分解哨兵 (D1)
 * @state: real
 *
 * 从 SOG 图中提取营收数据：DOCUMENT(提取:finance维度) + FINANCIAL 节点 + diagnosis_snapshots。
 * 数据可通过文档上传或人工汇报提供。每月1日9:00巡检。
 */

import type { Sentinel, SentinelCheckResult, SentinelConfig, SentinelContext, SentinelFinding } from '../types';
import { discoverTeams } from './helpers';
import { createLogger } from '../../logger';

const log = createLogger('sentinel/revenue');

const config: SentinelConfig = {
  id: 'sentinel-revenue-decomposition', name: '营收分解', description: '按产品线/渠道/区域的营收结构分析。数据源: SOG图+诊断快照(人工汇报)。', category: 'capability', priority: 'P1', mode: 'cron', cron: '0 9 1 * *', requiredDataSources: ['sog_graph', 'diagnosis_snapshots'], confidenceModel: 'statistical', version: '1.0.0',
};

export const revenueDecompositionSentinel: Sentinel = {
  config,
  async check(context: SentinelContext): Promise<SentinelCheckResult> {
    const { now } = context; const checkedAt = now.toISOString(); const startTime = Date.now();
    try {
      const teams = discoverTeams(context);
      const db = context.db as { prepare(sql: string): { all(): Array<Record<string, unknown>> } } | null;
      const allFindings: SentinelFinding[] = []; let anyData = false;
      for (const teamId of teams) {
        const financialNodes: Array<Record<string, unknown>> = [];
        const docNodes: Array<Record<string, unknown>> = [];
        if (db) {
          try { const rows = db.prepare("SELECT props FROM graph_nodes WHERE (type IN ('FINANCIAL','DOCUMENT')) AND props IS NOT NULL").all(); for (const r of rows) { const p = typeof r.props === 'string' ? JSON.parse(r.props as string) : (r.props || {}); if (p.dimensionKey === 'finance' || p.revenue) { financialNodes.push(p); anyData = true; } else if (p.extraction_content?.finance) { docNodes.push(p); anyData = true; } } } catch { /* 表不存在 */ }
        }
        if (!anyData) continue;
        const allFinance = [...financialNodes, ...docNodes];
        const revenueTotal = allFinance.reduce((s: number, p: Record<string, unknown>) => s + (Number(p.revenue) || Number(p.totalRevenue) || 0), 0);
        const lines: Array<{ name: string; share: number }> = [];
        for (const p of allFinance) {
          const name = (p.productLine || p.line || p.channel || p.category || '未分类') as string;
          const rev = Number(p.revenue) || Number(p.totalRevenue) || 0;
          if (rev > 0) lines.push({ name, share: rev / (revenueTotal || 1) });
        }
        if (revenueTotal > 0 && lines.length > 0) {
          const top = lines.sort((a, b) => b.share - a.share)[0];
          if (top.share > 0.5) { allFindings.push({ id: `rev-concent-${teamId}-${now.getTime()}`, severity: 'warning', title: `营收集中度过高: ${top.name} 占 ${(top.share*100).toFixed(0)}%`, description: `${lines.length} 条营收线中"${top.name}"占比超过50%，过度依赖单一来源。`, evidence: lines.map(l => `${l.name}: ${(l.share*100).toFixed(0)}%`), suggestion: '分散营收来源，降低单一产品/渠道依赖风险。', detectedAt: checkedAt }); }
        }
      }
      if (!anyData) return { sentinelId: config.id, ok: true, findings: [], durationMs: Date.now() - startTime, checkedAt, degraded: true };
      return { sentinelId: config.id, ok: true, findings: allFindings, durationMs: Date.now() - startTime, checkedAt, degraded: false };
    } catch (err: unknown) { return { sentinelId: config.id, ok: false, findings: [], durationMs: Date.now() - startTime, checkedAt, error: (err as Error)?.message || String(err), degraded: true }; }
  },
};
