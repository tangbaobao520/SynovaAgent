/**
 * sentinel/adapters/financial-impact-sentinel.ts — 财务影响哨兵 (D1)
 * @state: real
 *
 * 从 SOG 图 FINANCIAL 节点计算组织低效的财务成本。
 * 数据通过文档上传或人工汇报提供。每月1日9:00巡检。
 */

import type { Sentinel, SentinelCheckResult, SentinelConfig, SentinelContext, SentinelFinding } from '../types';
import { discoverTeams } from './helpers';
import { createLogger } from '../../logger';

const log = createLogger('sentinel/fin-impact');

const config: SentinelConfig = {
  id: 'sentinel-financial-impact', name: '财务影响分析', description: '将组织诊断指标映射为财务成本估算。数据源:SOG FINANCIAL节点。', category: 'risk', priority: 'P1', mode: 'cron', cron: '0 9 1 * *', requiredDataSources: ['sog_graph'], confidenceModel: 'statistical', version: '2.0.0',
};

// 常见组织低效的成本因子
const COST_FACTORS = ['沟通低效', '信息断裂', '单点依赖', '重复工作', '决策延迟', '技术债务'];
const AVG_COST_PER_PERSON = 5000; // 每人月均低效成本（保守估计）

export const financialImpactSentinel: Sentinel = {
  config,
  async check(context: SentinelContext): Promise<SentinelCheckResult> {
    const { now } = context; const checkedAt = now.toISOString(); const startTime = Date.now();
    try {
      const teams = discoverTeams(context);
      const db = context.db as { prepare(sql: string): { all(...params: unknown[]): Array<Record<string, unknown>> } } | null;
      const allFindings: SentinelFinding[] = []; let anyData = false;
      for (const teamId of teams) {
        let totalCost = 0; let riskMultiplier = 1;
        const costBreakdown: Array<{ factor: string; monthlyCost: number }> = [];
        if (db) {
          try {
            const rows = db.prepare("SELECT props FROM graph_nodes WHERE type = 'FINANCIAL' AND props IS NOT NULL").all();
            for (const r of rows) {
              const p = typeof r.props === 'string' ? JSON.parse(r.props as string) : (r.props || {});
              if (p.totalMonthlyCost) { totalCost += Number(p.totalMonthlyCost); anyData = true; }
              if (p.riskMultiplier || p.risk_multiplier) { riskMultiplier = Math.max(riskMultiplier, Number(p.riskMultiplier || p.risk_multiplier)); }
              for (const factor of COST_FACTORS) { if (p[factor]) { costBreakdown.push({ factor, monthlyCost: Number(p[factor]) }); anyData = true; } }
            }
            // 无精确数据 → 从诊断快照中人数估算
            const snapRows = db.prepare("SELECT data FROM diagnosis_snapshots WHERE team_id = ? ORDER BY created_at DESC LIMIT 1").all(teamId);
            if (totalCost === 0 && snapRows.length > 0) {
              const data = typeof snapRows[0].data === 'string' ? JSON.parse(snapRows[0].data as string) : (snapRows[0].data || {});
              const people = Number(data.teamSize || data.people || 0);
              if (people > 0) { totalCost = people * AVG_COST_PER_PERSON; anyData = true; }
            }
          } catch { /* */ }
        }
        if (!anyData) continue;
        const riskAdjustedCost = totalCost * riskMultiplier;
        if (totalCost > 50000) {
          allFindings.push({ id: `fin-high-${teamId}-${now.getTime()}`, severity: 'warning', title: `组织低效月成本: ¥${totalCost.toLocaleString()}`, description: `估算的低效成本基于 ${COST_FACTORS.join('/')} 等因素。`, evidence: costBreakdown.length > 0 ? costBreakdown.map(c => `${c.factor}: ¥${c.monthlyCost.toLocaleString()}`) : [`人均估算: ¥${AVG_COST_PER_PERSON}/月`], suggestion: '优先降低通信和决策成本——这两项通常占低效成本的60%以上。', detectedAt: checkedAt });
        }
        if (riskMultiplier > 1.5) {
          allFindings.push({ id: `fin-risk-${teamId}-${now.getTime()}`, severity: 'critical', title: `风险调整后成本飙升 ${((riskMultiplier-1)*100).toFixed(0)}%`, description: `风险调整后月成本 ¥${riskAdjustedCost.toLocaleString()}，基准 ¥${totalCost.toLocaleString()}`, evidence: [`风险乘数: ${riskMultiplier}x`, `调整后: ¥${riskAdjustedCost.toLocaleString()}`], suggestion: '降低不确定性（客户集中度、关键人依赖）比降低运营成本更紧迫。', detectedAt: checkedAt });
        }
      }
      if (!anyData) return { sentinelId: config.id, ok: true, findings: [], durationMs: Date.now() - startTime, checkedAt, degraded: true };
      return { sentinelId: config.id, ok: true, findings: allFindings, durationMs: Date.now() - startTime, checkedAt, degraded: false };
    } catch (err: unknown) { return { sentinelId: config.id, ok: false, findings: [], durationMs: Date.now() - startTime, checkedAt, error: (err as Error)?.message || String(err), degraded: true }; }
  },
};
