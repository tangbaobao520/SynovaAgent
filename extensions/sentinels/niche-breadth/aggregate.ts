import type { SentinelFinding } from '../../../src/sentinel/types';
import type { GraphTraversal } from '../../../src/l4/graph-traversal';
import { computeLevinsBreadth } from './computes/levins-breadth';
import { createLogger } from '@synova/logger';
const log = createLogger('sentinel/niche-breadth');
interface GraphStoreReader { queryNodes(t: string, f?: Record<string, unknown>, g?: string): Array<{ id: string; type: string; props: Record<string, unknown> }>; }
export const nicheBreadthSentinel = {
  async check(store: GraphStoreReader, teamId: string, traversal?: GraphTraversal): Promise<SentinelFinding[]> {
    const now = new Date(); const checkedAt = now.toISOString();
    try {
      if (traversal) { const r = traversal.traverse([teamId], ['DEPLOYS']); if (!r.nodes[0]) return []; }
      const clientNodes = store.queryNodes('Client', { teamId });
      const locationNodes = store.queryNodes('Location', { teamId });
      const marketNodes = store.queryNodes('Market', { teamId });
      const segments = [...clientNodes, ...locationNodes, ...marketNodes].map(n => ({
        name: (n.props.name as string) || n.id,
        value: Number(n.props.revenue) || Number(n.props.amount) || 1,
      }));
      const r = computeLevinsBreadth(segments);
      log.debug({ breadth: r.breadth, depth: r.depth, volume: r.volume }, '生态位计算完成');
      const f: SentinelFinding[] = [];
      if (r.breadth < 1.0) {
        f.push({ id: `i1-breadth-crit-${now.getTime()}`, severity: 'critical', title: `生态位过窄 (B=${r.breadth.toFixed(2)})`, description: `单一细分市场占比过高。`, evidence: [`B: ${r.breadth.toFixed(2)}`, `D: ${r.depth.toFixed(2)}`], suggestion: '拓展品类或区域。', detectedAt: checkedAt });
      } else if (r.breadth < 1.5) {
        f.push({ id: `i1-breadth-warn-${now.getTime()}`, severity: 'warning', title: `生态位偏窄 (B=${r.breadth.toFixed(2)})`, description: `B < 1.5, 多样性不足。`, evidence: [`B: ${r.breadth.toFixed(2)}`, `D: ${r.depth.toFixed(2)}`], suggestion: '评估扩展机会。', detectedAt: checkedAt });
      }
      if (r.depth > 0.5) {
        f.push({ id: `i1-depth-${now.getTime()}`, severity: 'warning', title: `生态位深度过高 (D=${r.depth.toFixed(2)})`, description: `单一细分市场依赖度过高。`, evidence: [`D: ${r.depth.toFixed(2)}`], suggestion: '分散市场依赖。', detectedAt: checkedAt });
      }
      return f;
    } catch (err: unknown) { log.error({ err }, '[niche-breadth] 失败'); return [{ id: `i1-error-${now.getTime()}`, severity: 'warning', title: '生态位检测异常', description: `${(err as Error)?.message || String(err)}`, evidence: [], suggestion: '检查数据源。', detectedAt: checkedAt }]; }
  },
};
