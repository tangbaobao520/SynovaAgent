/**
 * sentinel/adapters/risk-aggregator-sentinel.ts — 风险聚合哨兵 (D7)
 * @state: real
 *
 * 遍历 SOG 图 RISK 节点，生成风险热力图 + TopN 排序。
 * 每周一9:00巡检。
 */

import type { Sentinel, SentinelCheckResult, SentinelConfig, SentinelContext, SentinelFinding } from '../types';
import { discoverTeams } from './helpers';
import { createLogger } from '../../logger';

const log = createLogger('sentinel/risk-aggregator');

const config: SentinelConfig = {
  id: 'sentinel-risk-aggregator', name: '风险聚合', description: '遍历RISK节点生成热力图+TopN排序。数据源:SOG RISK节点。', category: 'risk', priority: 'P2', mode: 'cron', cron: '0 9 * * 1', requiredDataSources: ['sog_graph'], confidenceModel: 'statistical', version: '2.0.0',
};

export const riskaggregatorSentinel: Sentinel = {
  config,
  async check(context: SentinelContext): Promise<SentinelCheckResult> {
    const { now } = context; const checkedAt = now.toISOString(); const startTime = Date.now();
    try {
      const teams = discoverTeams(context);
      const db = context.db as { prepare(sql: string): { all(): Array<Record<string, unknown>> } } | null;
      const allFindings: SentinelFinding[] = [];
      const allRisks: Array<{ name: string; severity: string; probability: number; impact: number; category: string }> = [];
      if (db) {
        try {
          const rows = db.prepare("SELECT props FROM graph_nodes WHERE type = 'RISK' AND props IS NOT NULL").all();
          for (const r of rows) {
            const p = typeof r.props === 'string' ? JSON.parse(r.props as string) : (r.props || {});
            allRisks.push({
              name: (p.name || p.title || '未命名风险') as string,
              severity: (p.severity || p.level || 'medium') as string,
              probability: Number(p.probability) || 0.5,
              impact: Number(p.impact) || Number(p.score) || 5,
              category: (p.category || p.type || 'general') as string,
            });
          }
        } catch { /* */ }
      }
      if (allRisks.length === 0) return { sentinelId: config.id, ok: true, findings: [], durationMs: Date.now() - startTime, checkedAt, degraded: true };
      // 按严重度分组
      const critCount = allRisks.filter(r => r.severity === 'critical').length;
      const highCount = allRisks.filter(r => r.severity === 'high').length;
      // 按风险分排序
      const sorted = [...allRisks].sort((a, b) => (b.impact * b.probability) - (a.impact * a.probability));
      const top3 = sorted.slice(0, 3);
      // 按类别分组
      const byCategory: Record<string, number> = {};
      for (const r of allRisks) { byCategory[r.category] = (byCategory[r.category] || 0) + 1; }
      if (critCount > 0) {
        allFindings.push({ id: `ra-crit-${now.getTime()}`, severity: 'critical', title: `${critCount} 个 critical 风险待处理`, description: `Top3: ${top3.map(r => `${r.name}(${(r.impact*r.probability).toFixed(1)})`).join(', ')}`, evidence: [`总风险: ${allRisks.length}`, `critical: ${critCount}`, `high: ${highCount}`, ...Object.entries(byCategory).map(([k,v]) => `${k}: ${v}`)], suggestion: `优先处理 ${top3[0]?.name || '最高风险'}——这是当前最大的业务威胁。`, detectedAt: checkedAt });
      } else if (highCount > 2) {
        allFindings.push({ id: `ra-high-${now.getTime()}`, severity: 'warning', title: `${highCount} 个 high 级别风险`, description: `风险类别分布: ${Object.entries(byCategory).map(([k,v]) => `${k}(${v})`).join(', ')}`, evidence: [`总风险: ${allRisks.length}`, `high: ${highCount}`, `分类: ${Object.keys(byCategory).join(',')}`], suggestion: '建立风险缓解计划，按影响×概率排序处理。', detectedAt: checkedAt });
      }
      return { sentinelId: config.id, ok: true, findings: allFindings, durationMs: Date.now() - startTime, checkedAt, degraded: false };
    } catch (err: unknown) { return { sentinelId: config.id, ok: false, findings: [], durationMs: Date.now() - startTime, checkedAt, error: (err as Error)?.message || String(err), degraded: true }; }
  },
};
