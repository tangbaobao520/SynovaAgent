/**
 * capital-efficiency/aggregate.ts — F3 资本配置效率哨兵
 *
 * 综合 computeRoicWaccSpread + computeCapitalTurnover + computeWacc 结果，
 * 比较 manifest.json 阈值，输出 SentinelFinding[]。
 */
import type { SentinelFinding } from '../../../src/sentinel/types';
import type { GraphTraversal } from '../../../src/l4/graph-traversal';
import { computeRoicWaccSpread } from './computes/roic-wacc-spread';
import { computeCapitalTurnover } from './computes/capital-turnover';
import { computeWacc } from './computes/wacc';
import { createLogger } from '@synova/logger';

const log = createLogger('sentinel/capital-efficiency');

interface GraphStoreReader {
  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{
    id: string; type: string; props: Record<string, unknown>;
  }>;
}

export const capitalEfficiencySentinel = {
  async check(store: GraphStoreReader, teamId: string, traversal?: GraphTraversal): Promise<SentinelFinding[]> {
    const now = new Date();
    const checkedAt = now.toISOString();
    const findings: SentinelFinding[] = [];
    let finNodes: Array<{ id: string; type: string; props: Record<string, unknown> }> = [];
    let usedTraversal = false;

    try {
      try {
        if (traversal) {
          const result = traversal.traverse([teamId], ['FUNDS', 'PRODUCES']);
          if (result.nodes[0]) { finNodes = result.nodes; usedTraversal = true; }
        }
      } catch (err: unknown) { log.warn({ err, teamId }, '图遍历失败 — 降级到旧路径'); }
      if (!usedTraversal) { finNodes = store.queryNodes('Financial', { teamId }); }
      const financials = finNodes.map(n => ({
        revenue: Number(n.props.revenue) || Number(n.props.totalRevenue) || 0,
        cost: Number(n.props.cost) || Number(n.props.costs) || 0,
        operatingExpenses: Number(n.props.operatingExpenses) || 0,
        totalDebt: Number(n.props.totalDebt) || 0,
        equity: Number(n.props.equity) || 0,
        taxRate: Number(n.props.taxRate) || 0,
        waccOverride: Number(n.props.wacc) || undefined,
      }));

      log.debug({ totalFinNodes: financials.length }, '资本效率计算');

      if (financials.length === 0 || financials.every(f => f.revenue === 0)) return [];

      // Compute WACC if no override
      const hasWaccOverride = financials.some(f => f.waccOverride !== undefined);
      let waccValue: number | undefined;
      if (!hasWaccOverride) {
        const waccResult = computeWacc(financials);
        if (!waccResult.degraded) { waccValue = waccResult.wacc; log.debug({ wacc: waccValue }, 'WACC 计算完成'); }
      }

      const financialsForSpread = waccValue
        ? financials.map(f => ({ ...f, waccOverride: f.waccOverride || waccValue }))
        : financials;
      const spreadResult = computeRoicWaccSpread(financialsForSpread);
      log.debug({ spread: spreadResult.spread, roic: spreadResult.roic, wacc: spreadResult.wacc }, 'ROIC/WACC 计算');

      if (!spreadResult.degraded) {
        const spPct = (spreadResult.spread * 100).toFixed(1);
        const roicPct = (spreadResult.roic * 100).toFixed(1);
        const waccPct = (spreadResult.wacc * 100).toFixed(1);

        if (spreadResult.spread < -0.05) {
          findings.push({ id: `f3-spread-crit-${now.getTime()}`, severity: 'critical', title: `ROIC (${roicPct}%) 低于 WACC (${waccPct}%) — 价值毁灭`, description: `ROIC/WACC 差距 ${spPct} 个百分点。`, evidence: [`ROIC: ${roicPct}%`, `WACC: ${waccPct}%`, `差距: ${spPct}%`, ...spreadResult.warnings], suggestion: '立即停止需要外部融资的扩张，聚焦现金流。', detectedAt: checkedAt });
        } else if (spreadResult.spread < 0) {
          findings.push({ id: `f3-spread-warn-${now.getTime()}`, severity: 'warning', title: `ROIC (${roicPct}%) 略低于 WACC (${waccPct}%)`, description: `资本配置效率不足，差距 ${Math.abs(spreadResult.spread * 100).toFixed(1)} 个百分点。`, evidence: [`ROIC: ${roicPct}%`, `WACC: ${waccPct}%`, ...spreadResult.warnings], suggestion: '评估资本配置效率。', detectedAt: checkedAt });
        }
      }

      const turnoverResult = computeCapitalTurnover(financials);
      log.debug({ turnover: turnoverResult.turnover }, '资本周转率计算');

      if (!turnoverResult.degraded) {
        if (turnoverResult.turnover < 0.4) {
          findings.push({ id: `f3-turnover-crit-${now.getTime()}`, severity: 'critical', title: `资本周转率过低 (${turnoverResult.turnover.toFixed(2)})`, description: `每单位资本仅产生 ${turnoverResult.turnover.toFixed(2)} 倍营收。`, evidence: [`周转率: ${turnoverResult.turnover.toFixed(2)}`, `营收: ${turnoverResult.totalRevenue}`, `资本: ${turnoverResult.totalCapital}`], suggestion: '审查资产效率，处置低效资产。', detectedAt: checkedAt });
        } else if (turnoverResult.turnover < 0.8) {
          findings.push({ id: `f3-turnover-warn-${now.getTime()}`, severity: 'warning', title: `资本周转率偏低 (${turnoverResult.turnover.toFixed(2)})`, description: `资本使用效率不足。`, evidence: [`周转率: ${turnoverResult.turnover.toFixed(2)}`], suggestion: '优化资本配置。', detectedAt: checkedAt });
        }
      }

      return findings;
    } catch (err: unknown) {
      log.error({ err }, '[capital-efficiency] check 失败');
      return [{ id: `f3-error-${now.getTime()}`, severity: 'warning', title: '资本配置效率检测异常', description: `${(err as Error)?.message || String(err)}`, evidence: [], suggestion: '检查 SOG 图 FINANCIAL 数据源。', detectedAt: checkedAt }];
    }
  },
};
