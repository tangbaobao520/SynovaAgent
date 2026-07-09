import type { SentinelFinding } from '../../../src/sentinel/types';
import type { GraphTraversal } from '../../../src/l4/graph-traversal';
import { computeScaleEconomy } from './computes/scale-economy-score';
import { computeNetworkEffect } from './computes/network-effect-score';
import { computeSwitchingCost } from './computes/switching-cost-score';
import { computeProcessPower } from './computes/process-power-score';
import { computeCounterPositioningSlm } from './computes/counter-positioning-slm';
import { computeCorneredResource } from './computes/cornered-resource-score';
import { createLogger } from '@synova/logger';
const log = createLogger('sentinel/moat-structural');
interface GraphStoreReader { queryNodes(t: string, f?: Record<string, unknown>, g?: string): Array<{ id: string; type: string; props: Record<string, unknown> }>; }
export const competitiveMoatStructuralSentinel = {
  async check(store: GraphStoreReader, teamId: string, traversal?: GraphTraversal): Promise<SentinelFinding[]> {
    const now = new Date(); const checkedAt = now.toISOString();
    let finNodes: Array<{ id: string; type: string; props: Record<string, unknown> }> = [];
    let allNodes: Array<{ id: string; type: string; props: Record<string, unknown> }> = [];
    let usedTraversal = false;
    try {
      try { if (traversal) { const r = traversal.traverse([teamId], ['FUNDS', 'PRODUCES', 'DEPLOYS', 'SUBSTITUTES', 'LOCKS_IN']); if (r.nodes[0]) { finNodes = r.nodes; allNodes = r.nodes; usedTraversal = true; } } } catch (err: unknown) { log.warn({ err, teamId }, '图遍历失败 — 降级到旧路径'); }
      if (!usedTraversal) { finNodes = store.queryNodes('Financial', { teamId }); allNodes = store.queryNodes('ALL', { teamId }); }
      const financials = finNodes.map(n => ({ revenue: Number(n.props.revenue) || 0, totalAssets: Number(n.props.totalAssets) || 0 }));
      const se = computeScaleEconomy(financials);
      const ne = computeNetworkEffect(allNodes);
      const sc = computeSwitchingCost(allNodes);
      const pp = computeProcessPower(allNodes);
      // 从节点数据提取 SLM 参数，数据不足时降级
      const marketOutcomeNodes = allNodes.filter(n => n.type === 'MARKET_OUTCOME' || n.type === 'COMPETITIVE_OUTCOME');
      const ourFinancial = financials.length > 0 ? financials[0] : { revenue: 0, totalAssets: 0 };
      const ourRevenue = ourFinancial.revenue;
      const ourPrice = allNodes.length > 0
        ? allNodes.reduce((s, n) => s + (Number(n.props.price) || 0), 0) / allNodes.length
        : 0;
      if (allNodes.length === 0 || ourPrice === 0 || ourRevenue === 0) {
        return [{ id: `i3-nodata-${now.getTime()}`, severity: 'info',
          title: '护城河数据不足', description: '缺少市场价格或财务数据，无法计算结构性壁垒。',
          evidence: [`节点数: ${allNodes.length}`, `均价: ${ourPrice}`, `营收: ${ourRevenue}`],
          suggestion: '补充 Market Outcome 和 Financial 节点数据。', detectedAt: checkedAt }];
      }
      const marketData = marketOutcomeNodes.reduce((acc, n) => ({
        margin: acc.margin + (Number(n.props.incumbentMargin) || 0),
        price: acc.price + (Number(n.props.incumbentPrice) || 0),
        count: acc.count + 1
      }), { margin: 0, price: 0, count: 0 });
      const incumbentMargin = marketData.count > 0 ? marketData.margin / marketData.count : 0.3;
      const incumbentPrice = marketData.count > 0 ? marketData.price / marketData.count : 100;
      const slm = computeCounterPositioningSlm({ incumbentMargin, incumbentPrice, ourPrice, ourRevenue, incumbentRevenue: 0 });
      const cr = computeCorneredResource(allNodes);
      // T7b: 从traversal结果中提取SUBSTITUTES和LOCKS_IN边属性
      let subScore = 0, lockScore = 0;
      if (usedTraversal && traversal) {
        try {
          const subResult = traversal.traverse([teamId], ['SUBSTITUTES']);
          const subEdges = subResult.edges;
          if (subEdges.length > 0) {
            const avgSubRate = subEdges.reduce((s, e) => s + (Number(e.props.substitution_rate) || 0), 0) / subEdges.length;
            subScore = 1 - Math.min(avgSubRate, 1); // 替代率低 → 护城河强
          } else { subScore = 0.5; } // 无替代数据 → 中性
        } catch (_e) { subScore = 0.5; }
        try {
          const lockResult = traversal.traverse([teamId], ['LOCKS_IN']);
          const lockEdges = lockResult.edges;
          if (lockEdges.length > 0) {
            const avgLock = lockEdges.reduce((s, e) => s + (Number(e.props.lock_in_strength) || 0), 0) / lockEdges.length;
            lockScore = Math.min(avgLock, 1); // 锁定强 → 护城河强
          } else { lockScore = 0.5; }
        } catch (_e) { lockScore = 0.5; }
      } else { subScore = 0.5; lockScore = 0.5; }
      const score = (se.score + ne.score + sc.score + pp.score + (slm.applicable ? slm.slm : 0) + cr.score + subScore + lockScore) / 8;
      const scores = `规模${(se.score*100).toFixed(0)}% 网络${(ne.score*100).toFixed(0)}% 切换${(sc.score*100).toFixed(0)}% 流程${(pp.score*100).toFixed(0)}% SLM${slm.applicable ? (slm.slm*100).toFixed(0)+'%' : 'N/A'} 资源${(cr.score*100).toFixed(0)}% 替代${(subScore*100).toFixed(0)}% 锁定${(lockScore*100).toFixed(0)}%`;
      log.debug({ score }, '护城河强度计算完成');
      if (score < 0.3) return [{ id: `i3-crit-${now.getTime()}`, severity: 'critical', title: `护城河结构性弱 (${(score*100).toFixed(0)}%)`, description: '六力聚合得分低于 30%。', evidence: [`总分: ${(score*100).toFixed(0)}%`, scores], suggestion: '系统性构建竞争壁垒。', detectedAt: checkedAt }];
      if (score < 0.5) return [{ id: `i3-warn-${now.getTime()}`, severity: 'warning', title: `护城河结构偏弱 (${(score*100).toFixed(0)}%)`, description: '壁垒不够坚实。', evidence: [`总分: ${(score*100).toFixed(0)}%`, scores], suggestion: '识别最弱的维度并针对性强化。', detectedAt: checkedAt }];
      return [];
    } catch (err: unknown) { log.error({ err }, '[moat-structural] 失败'); return [{ id: `i3-error-${now.getTime()}`, severity: 'warning', title: '检测异常', description: `${(err as Error)?.message || String(err)}`, evidence: [], suggestion: '检查数据源。', detectedAt: checkedAt }]; }
  },
};
