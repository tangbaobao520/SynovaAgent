/**
 * sentinel/adapters/financial-snapshot-sentinel.ts — 财务快照哨兵 (D7)
 * @state: real
 *
 * 从 SOG 图 FINANCIAL 节点计算关键财务比率。支持人工汇报。
 * 每月1日9:00巡检。
 */

import type { Sentinel, SentinelCheckResult, SentinelConfig, SentinelContext, SentinelFinding } from '../types';
import { discoverTeams } from './helpers';
import { createLogger } from '../../logger';

const log = createLogger('sentinel/fin-snapshot');

const config: SentinelConfig = {
  id: 'sentinel-financial-snapshot', name: '财务快照', description: '毛利率/人均收入/YoY增长等关键比率。数据源:SOG FINANCIAL节点。', category: 'risk', priority: 'P2', mode: 'cron', cron: '0 9 1 * *', requiredDataSources: ['sog_graph'], confidenceModel: 'statistical', version: '2.0.0',
};

export const financialsnapshotSentinel: Sentinel = {
  config,
  async check(context: SentinelContext): Promise<SentinelCheckResult> {
    const { now } = context; const checkedAt = now.toISOString(); const startTime = Date.now();
    try {
      const teams = discoverTeams(context);
      const db = context.db as { prepare(sql: string): { all(): Array<Record<string, unknown>> } } | null;
      const allFindings: SentinelFinding[] = []; let anyData = false;
      for (const teamId of teams) {
        const metrics: Record<string, number> = {};
        let personCount = 0;
        if (db) {
          try {
            const finRows = db.prepare("SELECT props FROM graph_nodes WHERE type = 'FINANCIAL' AND props IS NOT NULL").all();
            for (const r of finRows) {
              const p = typeof r.props === 'string' ? JSON.parse(r.props as string) : (r.props || {});
              for (const k of ['revenue','cost','grossMargin','operatingExpenses','netProfit','yoyGrowth','cash']) {
                if (p[k] !== undefined) { metrics[k] = (metrics[k] || 0) + Number(p[k]); anyData = true; }
              }
            }
            const personRows = db.prepare("SELECT COUNT(*) as c FROM graph_nodes WHERE type = 'PERSON'").all();
            personCount = (personRows[0]?.c as number) || 0;
          } catch { /* */ }
        }
        if (!anyData) continue;
        const revenue = metrics.revenue || 0;
        const cost = metrics.cost || 0;
        const grossMargin = metrics.grossMargin || (revenue > 0 ? revenue - cost : 0);
        const marginPct = revenue > 0 ? (grossMargin / revenue) * 100 : null;
        const revPerPerson = personCount > 0 ? revenue / personCount : null;
        if (marginPct !== null && marginPct < 20) {
          allFindings.push({ id: `fs-margin-${teamId}-${now.getTime()}`, severity: 'warning', title: `毛利率偏低 (${marginPct.toFixed(1)}%)`, description: `营收 ¥${revenue.toLocaleString()}，成本 ¥${cost.toLocaleString()}，毛利率 ${marginPct.toFixed(1)}%。低于20%健康线。`, evidence: [`营收: ¥${revenue.toLocaleString()}`, `成本: ¥${cost.toLocaleString()}`, `毛利: ¥${grossMargin.toLocaleString()}`], suggestion: '审查成本结构，识别可优化项（SaaS订阅/基础设施/人力）。', detectedAt: checkedAt });
        }
        if (revPerPerson !== null && revPerPerson < 30000) {
          allFindings.push({ id: `fs-rpp-${teamId}-${now.getTime()}`, severity: 'warning', title: `人均收入偏低 (¥${revPerPerson.toLocaleString()}/月)`, description: `${personCount}人，月营收 ¥${revenue.toLocaleString()}，人均 ¥${(revPerPerson/10000).toFixed(1)}万`, evidence: [`人均: ¥${revPerPerson.toFixed(0)}/月`, `人数: ${personCount}`], suggestion: '评估团队规模和产出，考虑自动化替代重复劳动。', detectedAt: checkedAt });
        }
        const yoy = metrics.yoyGrowth;
        if (yoy !== undefined && yoy < 0 && revenue > 0) {
          allFindings.push({ id: `fs-yoy-${teamId}-${now.getTime()}`, severity: 'critical', title: `同比负增长 (${yoy.toFixed(1)}%)`, description: `营收 ¥${revenue.toLocaleString()}，同比增长 ${yoy.toFixed(1)}%。`, evidence: [`YoY: ${yoy.toFixed(1)}%`], suggestion: '检查客户流失和市场竞争，制定增长恢复计划。', detectedAt: checkedAt });
        }
      }
      if (!anyData) return { sentinelId: config.id, ok: true, findings: [], durationMs: Date.now() - startTime, checkedAt, degraded: true };
      return { sentinelId: config.id, ok: true, findings: allFindings, durationMs: Date.now() - startTime, checkedAt, degraded: false };
    } catch (err: unknown) { return { sentinelId: config.id, ok: false, findings: [], durationMs: Date.now() - startTime, checkedAt, error: (err as Error)?.message || String(err), degraded: true }; }
  },
};
