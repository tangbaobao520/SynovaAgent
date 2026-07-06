import type { SentinelFinding } from '../../../src/sentinel/types';
import type { GraphTraversal } from '../../../src/l4/graph-traversal';
import { computeAssetTurnover } from './computes/asset-turnover';
import { computeReceivableTurnover } from './computes/receivable-turnover';
import { computeCashConversionCycle } from './computes/cash-conversion-cycle';
import { createLogger } from '@synova/logger';
const log = createLogger('sentinel/capital-turnover');
interface GraphStoreReader { queryNodes(t: string, f?: Record<string, unknown>, g?: string): Array<{ id: string; type: string; props: Record<string, unknown> }>; }
export const capitalTurnoverSentinel = {
  async check(store: GraphStoreReader, teamId: string, traversal?: GraphTraversal): Promise<SentinelFinding[]> {
    const now = new Date(); const checkedAt = now.toISOString();
    let finNodes: Array<{ id: string; type: string; props: Record<string, unknown> }> = [];
    let usedTraversal = false;
    try {
      try { if (traversal) { const r = traversal.traverse([teamId], ['FUNDS']); if (r.nodes[0]) { finNodes = r.nodes; usedTraversal = true; } } } catch (err: unknown) { log.warn({ err, teamId }, '图遍历失败 — 降级到旧路径'); }
      if (!usedTraversal) { finNodes = store.queryNodes('Financial', { teamId }); }
      const f = finNodes.map(n => ({ revenue: Number(n.props.revenue) || 0, totalAssets: Number(n.props.totalAssets) || 0, currentAssets: Number(n.props.currentAssets) || 0, accountsReceivable: Number(n.props.accountsReceivable) || 0 }));
      const at = computeAssetTurnover(f); const rt = computeReceivableTurnover(f); const r: SentinelFinding[] = [];
      if (!at.degraded && at.totalTurnover < 0.5) r.push({ id: `f5-at-crit-${now.getTime()}`, severity: 'critical', title: `总资产周转率过低 (${at.totalTurnover.toFixed(2)})`, description: '每单位资产营收不足 0.5。', evidence: [`周转率: ${at.totalTurnover.toFixed(2)}`, `营收: ${at.totalRevenue}`, `总资产: ${at.totalAssets}`], suggestion: '审查资产效率，处置低效资产。', detectedAt: checkedAt });
      else if (!at.degraded && at.totalTurnover < 0.8) r.push({ id: `f5-at-warn-${now.getTime()}`, severity: 'warning', title: `总资产周转率偏低 (${at.totalTurnover.toFixed(2)})`, description: '周转率 < 0.8。', evidence: [`周转率: ${at.totalTurnover.toFixed(2)}`], suggestion: '优化资产配置。', detectedAt: checkedAt });
      if (!rt.degraded && rt.daysOutstanding > 90) r.push({ id: `f5-rt-crit-${now.getTime()}`, severity: 'critical', title: `应收周转天数过长 (${rt.daysOutstanding}d)`, description: '应收 > 90 天。', evidence: [`周转天数: ${rt.daysOutstanding}d`, `应收: ${rt.avgReceivables}`, `年营收: ${rt.totalRevenue}`], suggestion: '收紧信用政策，加速应收回收。', detectedAt: checkedAt });
      else if (!rt.degraded && rt.daysOutstanding > 60) r.push({ id: `f5-rt-warn-${now.getTime()}`, severity: 'warning', title: `应收周转天数偏长 (${rt.daysOutstanding}d)`, description: '应收 > 60 天。', evidence: [`周转天数: ${rt.daysOutstanding}d`], suggestion: '关注应收回收情况。', detectedAt: checkedAt });
      return r;
    } catch (err: unknown) { log.error({ err }, '[capital-turnover] 失败'); return [{ id: `f5-error-${now.getTime()}`, severity: 'warning', title: '检测异常', description: `${(err as Error)?.message || String(err)}`, evidence: [], suggestion: '检查数据源。', detectedAt: checkedAt }]; }
  },
};
