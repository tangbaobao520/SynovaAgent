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
      try { if (traversal) { const r = traversal.traverse([teamId], ['FUNDS', 'PRODUCES', 'DEPLOYS']); if (r.nodes[0]) { finNodes = r.nodes; allNodes = r.nodes; usedTraversal = true; } } } catch (err: unknown) { log.warn({ err, teamId }, '图遍历失败 — 降级到旧路径'); }
      if (!usedTraversal) { finNodes = store.queryNodes('Financial', { teamId }); allNodes = store.queryNodes('ALL', { teamId }); }
      const financials = finNodes.map(n => ({ revenue: Number(n.props.revenue) || 0, totalAssets: Number(n.props.totalAssets) || 0 }));
      const se = computeScaleEconomy(financials);
      const ne = computeNetworkEffect(allNodes);
      const sc = computeSwitchingCost(allNodes);
      const pp = computeProcessPower(allNodes);
      const slm = computeCounterPositioningSlm({ incumbentMargin: 0.6, incumbentPrice: 100, ourPrice: 60, ourRevenue: 100, incumbentRevenue: 5000 });
      const cr = computeCorneredResource(allNodes);
      const score = (se.score + ne.score + sc.score + pp.score + (slm.applicable ? slm.slm : 0) + cr.score) / 6;
      const scores = `规模${(se.score*100).toFixed(0)}% 网络${(ne.score*100).toFixed(0)}% 切换${(sc.score*100).toFixed(0)}% 流程${(pp.score*100).toFixed(0)}% SLM${slm.applicable ? (slm.slm*100).toFixed(0)+'%' : 'N/A'} 资源${(cr.score*100).toFixed(0)}%`;
      log.debug({ score }, '护城河强度计算完成');
      if (score < 0.3) return [{ id: `i3-crit-${now.getTime()}`, severity: 'critical', title: `护城河结构性弱 (${(score*100).toFixed(0)}%)`, description: '六力聚合得分低于 30%。', evidence: [`总分: ${(score*100).toFixed(0)}%`, scores], suggestion: '系统性构建竞争壁垒。', detectedAt: checkedAt }];
      if (score < 0.5) return [{ id: `i3-warn-${now.getTime()}`, severity: 'warning', title: `护城河结构偏弱 (${(score*100).toFixed(0)}%)`, description: '壁垒不够坚实。', evidence: [`总分: ${(score*100).toFixed(0)}%`, scores], suggestion: '识别最弱的维度并针对性强化。', detectedAt: checkedAt }];
      return [];
    } catch (err: unknown) { log.error({ err }, '[moat-structural] 失败'); return [{ id: `i3-error-${now.getTime()}`, severity: 'warning', title: '检测异常', description: `${(err as Error)?.message || String(err)}`, evidence: [], suggestion: '检查数据源。', detectedAt: checkedAt }]; }
  },
};
