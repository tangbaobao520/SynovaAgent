import type { SentinelFinding } from '../../../src/sentinel/types';
import type { GraphTraversal } from '../../../src/l4/graph-traversal';
import { computeTransactionCostTrend } from './computes/transaction-cost-trend';
import { createLogger } from '@synova/logger';
const log = createLogger('sentinel/transaction-cost');
interface GraphStoreReader { queryNodes(t: string, f?: Record<string, unknown>, g?: string): Array<{ id: string; type: string; props: Record<string, unknown> }>; }
export const internalTransactionCostSentinel = {
  async check(store: GraphStoreReader, teamId: string, traversal?: GraphTraversal): Promise<SentinelFinding[]> {
    const now = new Date(); const checkedAt = now.toISOString();
    let fin: Array<{ id: string; type: string; props: Record<string, unknown> }> = [];
    let teams: Array<{ id: string; type: string; props: Record<string, unknown> }> = [];
    let events: Array<{ id: string; type: string; props: Record<string, unknown> }> = [];
    let usedTraversal = false;
    try {
      // @deprecated — 语义迁移由D15处理
      try { if (traversal) { const r = traversal.traverse([teamId], ['FUNDS', 'DEPLOYS', 'SIGNAL_TRANSMITS']); if (r.nodes[0]) { fin = r.nodes; teams = r.nodes.filter(n => n.type === 'TEAM'); events = r.nodes.filter(n => n.type === 'EVENT'); usedTraversal = true; } } } catch (err: unknown) { log.warn({ err, teamId }, '图遍历失败 — 降级到旧路径'); }
      if (!usedTraversal) { fin = store.queryNodes('Financial', { teamId }); teams = store.queryNodes('Team', { teamId }); events = store.queryNodes('Event', { teamId }); }
      const totalCost = fin.reduce((s, n) => s + (Number(n.props.totalCost) || Number(n.props.cost) || 0), 0);
      const adminCost = fin.reduce((s, n) => s + (Number(n.props.adminCost) || Number(n.props.adminExpense) || 0), 0);
      // 读取历史数据，若无则使用当前值并标注 degraded
      const previousAdminCost = Number(fin[0]?.props?.previousAdminCost) || adminCost;
      const previousTotalCost = Number(fin[0]?.props?.previousTotalCost) || totalCost;
      const hasHistoricalData = fin[0]?.props?.previousAdminCost !== undefined && fin[0]?.props?.previousTotalCost !== undefined;
      const r = computeTransactionCostTrend({ totalCost, adminCost, teamCount: teams.length, eventCount: events.length, previousAdminCost, previousTotalCost });
      log.debug({ trend: r.trend }, '内部交易成本计算完成');
      if (r.trend > 0.1) return [{ id: `i11-trend-crit-${now.getTime()}`, severity: 'critical', title: `内部交易成本上升 (${(r.trend*100).toFixed(1)}%)`, description: '管理成本占比显著增加。', evidence: [`趋势: ${(r.trend*100).toFixed(1)}%`, `管理占比: ${(r.adminCostRatio*100).toFixed(0)}%`, ...r.signals], suggestion: '审查组织复杂度，简化流程。', detectedAt: checkedAt }];
      if (r.trend > 0.05) return [{ id: `i11-trend-warn-${now.getTime()}`, severity: 'warning', title: `内部交易成本微增 (${(r.trend*100).toFixed(1)}%)`, description: '管理成本有上升趋势。', evidence: [`趋势: ${(r.trend*100).toFixed(1)}%`], suggestion: '关注组织效率。', detectedAt: checkedAt }];
      return [];
    } catch (err: unknown) { log.error({ err }, '[transaction-cost] 失败'); return [{ id: `i11-error-${now.getTime()}`, severity: 'warning', title: '检测异常', description: `${(err as Error)?.message || String(err)}`, evidence: [], suggestion: '检查数据源。', detectedAt: checkedAt }]; }
  },
};
