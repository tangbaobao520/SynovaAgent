import type { SentinelFinding } from '../../../src/sentinel/types';
import type { GraphTraversal } from '../../../src/l4/graph-traversal';
import { computeMakeOrBuyScore } from './computes/make-or-buy-score';
import { createLogger } from '@synova/logger';
const log = createLogger('sentinel/make-or-buy');
interface GraphStoreReader { queryNodes(t: string, f?: Record<string, unknown>, g?: string): Array<{ id: string; type: string; props: Record<string, unknown> }>; }
export const makeOrBuySentinel = {
  async check(store: GraphStoreReader, teamId: string, traversal?: GraphTraversal): Promise<SentinelFinding[]> {
    const now = new Date(); const checkedAt = now.toISOString();
    try {
      // @deprecated — 语义迁移由D15处理
      if (traversal) { const r = traversal.traverse([teamId], ['DEPLOYS']); if (!r.nodes[0]) return []; }
      const personNodes = store.queryNodes('Person', { teamId });
      // 核心能力从 Person 节点的 role/dept/skills 提取
      const caps = personNodes.map(n => ({ category: (n.props.dept as string) || (n.props.role as string) || 'supporting', inHouse: n.props.inHouse !== false }));
      const r = computeMakeOrBuyScore(caps);
      if (r.degraded) { log.warn({ teamId }, 'compute degraded — skipping threshold'); return []; }
      if (r.health < 0.2) return [{ id: `i12-crit-${now.getTime()}`, severity: 'critical', title: `自制/外购决策风险 (${(r.health*100).toFixed(0)}%)`, description: '核心能力被外包。', evidence: [`健康度: ${(r.health*100).toFixed(0)}%`, `外包核心能力: ${r.outsourcedCore.join(',') || '无'}`], suggestion: '评估核心能力是否不应外包。', detectedAt: checkedAt }];
      return [];
    } catch (err: unknown) { log.error({ err }, '[make-or-buy] 失败'); return [{ id: `i12-error-${now.getTime()}`, severity: 'warning', title: '检测异常', description: `${(err as Error)?.message || String(err)}`, evidence: [], suggestion: '检查数据源。', detectedAt: checkedAt }]; }
  },
};
