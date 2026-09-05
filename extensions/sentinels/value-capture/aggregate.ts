import type { SentinelFinding } from '../../../src/sentinel/types';
import type { GraphTraversal } from '../../../src/l4/graph-traversal';
import { computeValueCaptureScore } from './computes/value-capture-score';
import { createLogger } from '@synova/logger';
const log = createLogger('sentinel/value-capture');
interface GraphStoreReader { queryNodes(t: string, f?: Record<string, unknown>, g?: string): Array<{ id: string; type: string; props: Record<string, unknown> }>; }
export const valueCaptureSentinel = {
  async check(store: GraphStoreReader, teamId: string, traversal?: GraphTraversal): Promise<SentinelFinding[]> {
    const now = new Date(); const checkedAt = now.toISOString();
    try {
      // @deprecated — 语义迁移由D15处理
      if (traversal) { const r = traversal.traverse([teamId], ['DEPLOYS']); if (!r.nodes[0]) return []; }
      const finNodes = store.queryNodes('Financial', { teamId });
      const financials = finNodes.map(n => ({ revenue: Number(n.props.revenue) || 0, cost: Number(n.props.cost) || 0, netProfit: Number(n.props.netProfit) || Number(n.props.profit) || 0, previousRevenue: Number(n.props.previousRevenue) || 0 }));
      const r = computeValueCaptureScore(financials);
      if (r.degraded) { log.warn({ teamId }, 'compute degraded — skipping threshold'); return []; }
      log.debug({ captureIndex: r.captureIndex }, '价值捕获计算完成');
      if (r.captureIndex < 0.2) return [{ id: `i6-crit`, severity: 'critical', title: `价值捕获效率低 (${(r.captureIndex*100).toFixed(0)}%)`, description: '利润留存和定价能力不足。', evidence: [`捕获指数: ${(r.captureIndex*100).toFixed(0)}%`, `毛利率: ${(r.grossMargin*100).toFixed(0)}%`, `净利润率: ${(r.profitRetention*100).toFixed(0)}%`], suggestion: '审查定价策略和成本结构。', detectedAt: checkedAt }];
      if (r.captureIndex < 0.4) return [{ id: `i6-warn`, severity: 'warning', title: `价值捕获效率偏低 (${(r.captureIndex*100).toFixed(0)}%)`, description: '价值转化能力需提升。', evidence: [`捕获指数: ${(r.captureIndex*100).toFixed(0)}%`, ...r.signals], suggestion: '优化定价和毛利率。', detectedAt: checkedAt }];
      return [];
    } catch (err: unknown) { log.error({ err }, '[value-capture] 失败'); return [{ id: `i6-error`, severity: 'warning', title: '检测异常', description: `${(err as Error)?.message || String(err)}`, evidence: [], suggestion: '检查数据源。', detectedAt: checkedAt }]; }
  },
};
