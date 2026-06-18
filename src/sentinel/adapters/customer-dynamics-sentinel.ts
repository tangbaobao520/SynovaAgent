/**
 * sentinel/adapters/customer-dynamics-sentinel.ts — 客户动态哨兵 (D1)
 * @state: real — 2026-06-18 Week 3: 增强分析维度
 *
 * 从 SOG CLIENT 节点提取客户健康度。
 * 每周一 9:00 巡检。
 */

import type { Sentinel, SentinelCheckResult, SentinelConfig, SentinelContext, SentinelFinding } from '../types';
import { discoverTeams } from './helpers';
import { createLogger } from '../../logger';

const log = createLogger('sentinel/customer');

const config: SentinelConfig = {
  id: 'sentinel-customer-dynamics', name: '客户动态',
  description: '客户集中度/流失风险/获客趋势/健康度评分。数据源: SOG CLIENT 节点 + diagnosis_snapshots。',
  category: 'risk', priority: 'P0', mode: 'cron', cron: '0 9 * * 1',
  requiredDataSources: ['sog_graph', 'diagnosis_snapshots'], confidenceModel: 'statistical', version: '2.0.0',
};

export const customerDynamicsSentinel: Sentinel = {
  config,
  async check(context: SentinelContext): Promise<SentinelCheckResult> {
    const { now } = context; const checkedAt = now.toISOString(); const startTime = Date.now();
    try {
      const db = context.db as { prepare(sql: string): { all(): Array<Record<string, unknown>> } } | null;
      if (!db) return { sentinelId: config.id, ok: true, findings: [], durationMs: Date.now() - startTime, checkedAt, degraded: true };

      const allFindings: SentinelFinding[] = [];
      let totalClients = 0;

      // 读取 CLIENT 节点
      const clients: Array<{ name: string; revenue: number; status: string; churn: boolean; since?: string; nps?: number }> = [];
      try {
        const rows = db.prepare("SELECT props FROM graph_nodes WHERE type = 'CLIENT' AND props IS NOT NULL").all();
        for (const r of rows) {
          const p = typeof r.props === 'string' ? JSON.parse(r.props as string) : (r.props || {}) as Record<string, unknown>;
          clients.push({
            name: (p.name || '未知') as string,
            revenue: Number(p.revenue) || 0,
            status: (p.status || 'active') as string,
            churn: p.churn === true || p.status === 'churned',
            since: p.since as string | undefined,
            nps: p.nps !== undefined ? Number(p.nps) : undefined,
          });
          totalClients++;
        }
      } catch { /* DB 不可用 */ }

      if (clients.length === 0) {
        return { sentinelId: config.id, ok: true, findings: [], durationMs: Date.now() - startTime, checkedAt, degraded: true };
      }

      const active = clients.filter(c => !c.churn);
      const churned = clients.filter(c => c.churn);
      const totalRev = clients.reduce((s, c) => s + c.revenue, 0);
      const activeRev = active.reduce((s, c) => s + c.revenue, 0);

      // 1. 流失率
      const churnRate = clients.length > 0 ? churned.length / clients.length : 0;
      const revenueChurnRate = totalRev > 0 ? (totalRev - activeRev) / totalRev : 0;
      if (churnRate > 0.2 || revenueChurnRate > 0.2) {
        allFindings.push({
          id: `cust-churn-${now.getTime()}`, severity: 'critical',
          title: `客户流失率过高 (数量${(churnRate * 100).toFixed(0)}% / 营收${(revenueChurnRate * 100).toFixed(0)}%)`,
          description: `${clients.length} 个客户中 ${churned.length} 个已流失。`,
          evidence: [`总客户: ${clients.length}`, `流失: ${churned.length}`, `流失率: ${(churnRate * 100).toFixed(0)}%`, `营收流失率: ${(revenueChurnRate * 100).toFixed(0)}%`],
          suggestion: '排查流失客户共性，建立客户成功团队，改善产品/服务。', detectedAt: checkedAt,
        });
      } else if (churnRate > 0.1) {
        allFindings.push({
          id: `cust-churn-warn-${now.getTime()}`, severity: 'warning',
          title: `客户流失趋势 (${(churnRate * 100).toFixed(0)}%)`,
          description: `${churned.length}/${clients.length} 个客户流失，超过 10% 警戒线。`,
          evidence: [`流失率: ${(churnRate * 100).toFixed(0)}%`, `流失客户: ${churned.map(c => c.name).join(', ')}`],
          suggestion: '启动客户挽回计划，调查流失原因。', detectedAt: checkedAt,
        });
      }

      // 2. 客户集中度 (营收 + 数量)
      if (active.length > 0 && totalRev > 0) {
        const topByRev = active.reduce((max, c) => c.revenue > max.revenue ? c : max, active[0]);
        const topShare = topByRev.revenue / totalRev;
        if (topShare > 0.4) {
          allFindings.push({
            id: `cust-concent-${now.getTime()}`, severity: 'warning',
            title: `客户集中度过高: ${topByRev.name} (${(topShare * 100).toFixed(0)}%)`,
            description: `最大客户占比超过 40%。单一客户流失将严重影响营收。`,
            evidence: [`最大客户: ${topByRev.name}`, `占比: ${(topShare * 100).toFixed(0)}%`, `活跃客户: ${active.length}`],
            suggestion: '拓展新客户，降低对最大客户的依赖。', detectedAt: checkedAt,
          });
        }
      }

      // 3. 客户健康度: NPS 低 + 高价值客户
      const lowNpsClients = active.filter(c => c.nps !== undefined && c.nps < 0);
      const highValueAtRisk = active.filter(c => c.revenue > 0 && c.nps !== undefined && c.nps < 30 && c.revenue / Math.max(totalRev, 1) > 0.1);
      if (highValueAtRisk.length > 0) {
        allFindings.push({
          id: `cust-atrisk-${now.getTime()}`, severity: 'warning',
          title: `高价值客户满意度低: ${highValueAtRisk.map(c => c.name).join(', ')}`,
          description: `${highValueAtRisk.length} 个高价值客户 NPS < 30，存在流失风险。`,
          evidence: highValueAtRisk.map(c => `${c.name}: NPS ${c.nps}, 营收占比 ${(c.revenue / totalRev * 100).toFixed(0)}%`),
          suggestion: '优先联系这些客户，了解不满原因并制定改进计划。', detectedAt: checkedAt,
        });
      }
      if (lowNpsClients.length > active.length * 0.3) {
        allFindings.push({
          id: `cust-nps-${now.getTime()}`, severity: 'warning',
          title: `客户满意度普遍偏低 (${lowNpsClients.length}/${active.length} NPS<0)`,
          description: '超过 30% 活跃客户的 NPS 为负值。',
          evidence: lowNpsClients.map(c => `${c.name}: NPS ${c.nps}`),
          suggestion: '启动客户满意度调查，识别共性投诉。', detectedAt: checkedAt,
        });
      }

      // 4. 健康状态
      if (allFindings.length === 0) {
        allFindings.push({
          id: `cust-healthy-${now.getTime()}`, severity: 'info',
          title: `客户健康度良好 (${active.length} 活跃客户)`,
          description: `总营收 ${totalRev}，流失率 ${(churnRate * 100).toFixed(0)}%，无集中风险。`,
          evidence: [`活跃客户: ${active.length}`, `总营收: ${totalRev}`],
          suggestion: '维持客户成功投入，关注客户健康趋势。', detectedAt: checkedAt,
        });
      }

      return { sentinelId: config.id, ok: true, findings: allFindings, durationMs: Date.now() - startTime, checkedAt, degraded: false };
    } catch (err: unknown) {
      log.error({ err }, '[customer] check 失败');
      return { sentinelId: config.id, ok: false, findings: [], durationMs: Date.now() - startTime, checkedAt, error: (err as Error)?.message || String(err), degraded: true };
    }
  },
};
