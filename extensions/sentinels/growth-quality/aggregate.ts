/**
 * growth-quality/aggregate.ts — F4 增长质量指数哨兵
 */
import type { SentinelFinding } from '../../../src/sentinel/types';
import type { GraphTraversal } from '../../../src/l4/graph-traversal';
import { computeCashConversionRate } from './computes/cash-conversion-rate';
import { computeOrganicGrowthPct } from './computes/organic-growth-pct';
import { createLogger } from '@synova/logger';

const log = createLogger('sentinel/growth-quality');
interface GraphStoreReader { queryNodes(type: string, f?: Record<string, unknown>, g?: string): Array<{ id: string; type: string; props: Record<string, unknown>; }>; }

export const growthQualitySentinel = {
  async check(store: GraphStoreReader, teamId: string, traversal?: GraphTraversal): Promise<SentinelFinding[]> {
    const now = new Date(); const checkedAt = now.toISOString();
    let finNodes: Array<{ id: string; type: string; props: Record<string, unknown> }> = [];
    let usedTraversal = false;
    try {
      try { if (traversal) { const r = traversal.traverse([teamId], ['FUNDS', 'PRODUCES']); if (r.nodes[0]) { finNodes = r.nodes; usedTraversal = true; } } } catch (err: unknown) { log.warn({ err, teamId }, '图遍历失败 — 降级到旧路径'); }
      if (!usedTraversal) { finNodes = store.queryNodes('FINANCIAL', { teamId }); }
      const financials = finNodes.map(n => ({
        operatingCashFlow: Number(n.props.operatingCashFlow) || 0,
        netIncome: Number(n.props.netIncome) || Number(n.props.profit) || 0,
        revenue: Number(n.props.revenue) || 0,
        previousRevenue: Number(n.props.previousRevenue) || 0,
        acquisitionRevenue: Number(n.props.acquisitionRevenue) || 0,
      }));

      const ccr = computeCashConversionRate(financials);
      const ogr = computeOrganicGrowthPct(financials);
      const findings: SentinelFinding[] = [];

      if (!ccr.degraded && ccr.rate < 0.5) {
        findings.push({ id: `f4-ccr-crit-${now.getTime()}`, severity: 'critical', title: `现金流转化率过低 (${(ccr.rate * 100).toFixed(0)}%)`, description: '净利润转化为经营现金流不足 50%，应收账款或存货积压严重。', evidence: [`转化率: ${(ccr.rate * 100).toFixed(0)}%`, `经营现金流: ${ccr.operatingCashFlow}`, `净利润: ${ccr.netIncome}`], suggestion: '收紧信用政策，加速应收账款回收。', detectedAt: checkedAt });
      } else if (!ccr.degraded && ccr.rate < 0.7) {
        findings.push({ id: `f4-ccr-warn-${now.getTime()}`, severity: 'warning', title: `现金流转化率偏低 (${(ccr.rate * 100).toFixed(0)}%)`, description: '转化率 < 70%。', evidence: [`转化率: ${(ccr.rate * 100).toFixed(0)}%`], suggestion: '检查应收账款和存货周转情况。', detectedAt: checkedAt });
      }

      if (!ogr.degraded && ogr.organicPct < 0.3) {
        findings.push({ id: `f4-org-crit-${now.getTime()}`, severity: 'critical', title: `有机增长比例过低 (${(ogr.organicPct * 100).toFixed(0)}%)`, description: '增长高度依赖并购而非内生能力。', evidence: [`有机增长占比: ${(ogr.organicPct * 100).toFixed(0)}%`, `总增长率: ${ogr.totalGrowth}%`], suggestion: '评估并购整合效果，加强内生增长能力。', detectedAt: checkedAt });
      } else if (!ogr.degraded && ogr.organicPct < 0.5) {
        findings.push({ id: `f4-org-warn-${now.getTime()}`, severity: 'warning', title: `有机增长比例偏低 (${(ogr.organicPct * 100).toFixed(0)}%)`, description: '有机增长 < 50%。', evidence: [`有机增长占比: ${(ogr.organicPct * 100).toFixed(0)}%`], suggestion: '关注内生增长动力。', detectedAt: checkedAt });
      }

      return findings;
    } catch (err: unknown) {
      log.error({ err }, '[growth-quality] check 失败');
      return [{ id: `f4-error-${now.getTime()}`, severity: 'warning', title: '增长质量检测异常', description: `${(err as Error)?.message || String(err)}`, evidence: [], suggestion: '检查数据源。', detectedAt: checkedAt }];
    }
  },
};
