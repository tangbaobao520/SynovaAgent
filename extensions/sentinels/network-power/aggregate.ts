import type { SentinelFinding } from '../../../src/sentinel/types';
import type { GraphTraversal } from '../../../src/l4/graph-traversal';
import { computeNetworkPower } from './computes/betweenness-centrality';
import { createLogger } from '@synova/logger';
const log = createLogger('sentinel/network-power');
interface GraphStoreReader { queryNodes(t: string, f?: Record<string, unknown>, g?: string): Array<{ id: string; type: string; props: Record<string, unknown> }>; }
export const networkPowerSentinel = {
  async check(store: GraphStoreReader, teamId: string, traversal?: GraphTraversal): Promise<SentinelFinding[]> {
    const now = new Date(); const checkedAt = now.toISOString();
    try {
    let allNodeData: Array<{ id: string; type: string; props: Record<string, unknown> }> = [];
    let usedTraversal = false;
    try {
      // @deprecated — 语义迁移由D15处理
      if (traversal) { const r = traversal.traverse([teamId], ['DEPLOYS']); if (r.nodes[0]) { allNodeData = r.nodes; usedTraversal = true; } }
    } catch (err: unknown) { log.warn({ err, teamId }, 'graph traversal failed - fallback'); }
      const nodes = [...store.queryNodes('Person', { teamId }), ...store.queryNodes('Agent', { teamId }), ...store.queryNodes('Client', { teamId }), ...store.queryNodes('Agent', { teamId })];
      const r = computeNetworkPower(nodes);
      if (r.degraded) { log.warn({ teamId }, 'compute degraded — skipping threshold'); return []; }
      log.debug({ powerIndex: r.powerIndex }, '网络权力计算完成');
      if (r.powerIndex > 0.8) return [{ id: `i5-crit-${now.getTime()}`, severity: 'critical', title: `网络权力集中 (指数${r.powerIndex.toFixed(2)})`, description: '权力或信息流高度集中在少数节点。', evidence: [`权力指数: ${r.powerIndex.toFixed(2)}`, `关键节点: ${r.keyNodes.join(', ')}`], suggestion: '分散关键决策权，降低单点故障风险。', detectedAt: checkedAt }];
      if (r.powerIndex > 0.6) return [{ id: `i5-warn-${now.getTime()}`, severity: 'warning', title: `网络权力偏高 (${r.powerIndex.toFixed(2)})`, description: '部分节点权力过大。', evidence: [`指数: ${r.powerIndex.toFixed(2)}`, `总节点: ${r.totalNodes}`], suggestion: '评估关键人员的备份计划。', detectedAt: checkedAt }];
      return [];
    } catch (err: unknown) { log.error({ err }, '[network-power] 失败'); return [{ id: `i5-error-${now.getTime()}`, severity: 'warning', title: '检测异常', description: `${(err as Error)?.message || String(err)}`, evidence: [], suggestion: '检查数据源。', detectedAt: checkedAt }]; }
  },
};
