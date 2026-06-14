/**
 * sentinel/adapters/customer-dynamics-sentinel.ts — 客户动态哨兵 (D1)
 * @state: real
 *
 * 从 SOG 图中提取客户数据：CLIENT节点 + DOCUMENT(提取:client维度) + diagnosis_snapshots。
 * 支持通过日报/周报/文档上传提供数据。每周一9:00巡检。
 */

import type { Sentinel, SentinelCheckResult, SentinelConfig, SentinelContext, SentinelFinding } from '../types';
import { discoverTeams } from './helpers';
import { createLogger } from '../../logger';

const log = createLogger('sentinel/customer');

const config: SentinelConfig = {
  id: 'sentinel-customer-dynamics', name: '客户动态', description: '客户集中度/流失风险/获客趋势。数据源: SOG图+人工汇报。', category: 'risk', priority: 'P0', mode: 'cron', cron: '0 9 * * 1', requiredDataSources: ['sog_graph', 'diagnosis_snapshots'], confidenceModel: 'statistical', version: '1.0.0',
};

export const customerDynamicsSentinel: Sentinel = {
  config,
  async check(context: SentinelContext): Promise<SentinelCheckResult> {
    const { now } = context; const checkedAt = now.toISOString(); const startTime = Date.now();
    try {
      const teams = discoverTeams(context);
      const db = context.db as { prepare(sql: string): { all(): Array<Record<string, unknown>> } } | null;
      const allFindings: SentinelFinding[] = []; let totalClients = 0;
      for (const teamId of teams) {
        const clients: Array<Record<string, unknown>> = [];
        if (db) {
          try { const rows = db.prepare("SELECT props FROM graph_nodes WHERE type = 'CLIENT' AND props IS NOT NULL").all(); for (const r of rows) { const p = typeof r.props === 'string' ? JSON.parse(r.props as string) : (r.props || {}); clients.push({ name: p.name || r.id, revenue: Number(p.revenue) || 0, status: p.status || 'active', churn: p.churn === true || p.status === 'churned' }); totalClients++; } } catch { /* 表不存在 */ }
        }
        if (clients.length === 0) continue;
        const churned = clients.filter(c => c.churn).length;
        const churnRate = churned / clients.length;
        const totalRev = clients.reduce((s, c) => s + (c.revenue as number), 0);
        const topClient = clients.reduce((max, c) => (c.revenue as number) > (max.revenue as number) ? c : max, clients[0]);
        const topShare = totalRev > 0 ? (topClient.revenue as number) / totalRev : 0;
        if (churnRate > 0.2) { allFindings.push({ id: `cust-churn-${teamId}-${now.getTime()}`, severity: 'critical', title: `客户流失率过高 (${(churnRate*100).toFixed(0)}%)`, description: `${clients.length}个客户中${churned}个已流失。流失率>20%需紧急关注。`, evidence: [`总客户: ${clients.length}`, `流失: ${churned}`, `流失率: ${(churnRate*100).toFixed(0)}%`], suggestion: '排查流失客户共性，改善产品/服务，建立客户成功团队。', detectedAt: checkedAt }); }
        else if (churnRate > 0.1) { allFindings.push({ id: `cust-churn-${teamId}-${now.getTime()}`, severity: 'warning', title: `客户流失趋势 (${(churnRate*100).toFixed(0)}%)`, description: `${churned}/${clients.length}个客户流失，超过10%警戒线。`, evidence: [`流失率: ${(churnRate*100).toFixed(0)}%`], suggestion: '启动客户挽回计划，调查流失原因。', detectedAt: checkedAt }); }
        if (topShare > 0.4) { allFindings.push({ id: `cust-concent-${teamId}-${now.getTime()}`, severity: 'warning', title: `客户集中度过高: ${topClient.name} (${(topShare*100).toFixed(0)}%)`, description: `最大客户占比超过40%。单一客户流失将严重影响营收。`, evidence: [`最大客户: ${topClient.name}`, `占比: ${(topShare*100).toFixed(0)}%`, `总客户: ${clients.length}`], suggestion: '拓展新客户，降低对最大客户的依赖。', detectedAt: checkedAt }); }
      }
      if (totalClients === 0) return { sentinelId: config.id, ok: true, findings: [], durationMs: Date.now() - startTime, checkedAt, degraded: true };
      return { sentinelId: config.id, ok: true, findings: allFindings, durationMs: Date.now() - startTime, checkedAt, degraded: false };
    } catch (err: unknown) { return { sentinelId: config.id, ok: false, findings: [], durationMs: Date.now() - startTime, checkedAt, error: (err as Error)?.message || String(err), degraded: true }; }
  },
};
