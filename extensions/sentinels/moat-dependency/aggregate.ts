import type { SentinelFinding } from '../../../src/sentinel/types';
import type { GraphTraversal } from '../../../src/l4/graph-traversal';
import { computeMoatDependency } from './computes/moat-dependency-score';
import { createLogger } from '@synova/logger';
const log = createLogger('sentinel/moat-dependency');
interface GraphStoreReader { queryNodes(t: string, f?: Record<string, unknown>, g?: string): Array<{ id: string; type: string; props: Record<string, unknown> }>; }
export const moatDependencySentinel = {
  async check(store: GraphStoreReader, teamId: string, traversal?: GraphTraversal): Promise<SentinelFinding[]> {
    const now = new Date(); const checkedAt = now.toISOString();
    try {
      if (traversal) { const r = traversal.traverse([teamId], ['DEPLOYS']); if (!r.nodes[0]) return []; }
      const r = computeMoatDependency(0.6, 0.3);
      if (r.dependency > 0.8) return [{ id: `i8-crit-${now.getTime()}`, severity: 'critical', title: `护城河结构vs感知差距大 (${(r.dependency*100).toFixed(0)}%)`, description: '结构性壁垒强但感知弱，价值未被市场认知。', evidence: [`差距: ${(r.dependency*100).toFixed(0)}%`], suggestion: '加强品牌和市场沟通。', detectedAt: checkedAt }];
      if (r.dependency > 0.6) return [{ id: `i8-warn-${now.getTime()}`, severity: 'warning', title: `护城河认知差距 (${(r.dependency*100).toFixed(0)}%)`, description: '结构性壁垒强于感知壁垒。', evidence: [`差距: ${(r.dependency*100).toFixed(0)}%`], suggestion: '评估是否需要加强市场认知。', detectedAt: checkedAt }];
      return [];
    } catch (err: unknown) { log.error({ err }, '[moat-dependency] 失败'); return [{ id: `i8-error-${now.getTime()}`, severity: 'warning', title: '检测异常', description: `${(err as Error)?.message || String(err)}`, evidence: [], suggestion: '检查数据源。', detectedAt: checkedAt }]; }
  },
};
