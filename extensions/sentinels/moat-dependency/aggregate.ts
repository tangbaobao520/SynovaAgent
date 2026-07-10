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
      // @deprecated — 语义迁移由D15处理
      if (traversal) { const r = traversal.traverse([teamId], ['DEPLOYS']); if (!r.nodes[0]) return []; }
      const finNodes = store.queryNodes('Financial', { teamId });
      const toolNodes = store.queryNodes('Tool', { teamId });
      const clientNodes = store.queryNodes('Client', { teamId });

      if (finNodes.length === 0 && toolNodes.length === 0 && clientNodes.length === 0) {
        return [{ id: `i8-nodata-${now.getTime()}`, severity: 'info', title: '护城河数据不足',
          description: '缺少 Financial/Tool/Client 节点，无法评估护城河依赖度。',
          evidence: [], suggestion: '补充财务和客户数据。', detectedAt: checkedAt }];
      }

      const structuralStrength = toolNodes.length > 0
        ? toolNodes.reduce((s, n) => s + (Number(n.props.moatScore) || 0.5), 0) / toolNodes.length
        : 0.5;
      const perceptualStrength = clientNodes.length > 0
        ? clientNodes.reduce((s, n) => s + (Number(n.props.nps) || 0) / 100, 0) / clientNodes.length
        : 0.3;
      const r = computeMoatDependency(structuralStrength, perceptualStrength);
      if (r.degraded) { log.warn({ teamId }, 'compute degraded — skipping threshold'); return []; }
      if (r.dependency > 0.8) return [{ id: `i8-crit-${now.getTime()}`, severity: 'critical', title: `护城河结构vs感知差距大 (${(r.dependency*100).toFixed(0)}%)`, description: '结构性壁垒强但感知弱，价值未被市场认知。', evidence: [`差距: ${(r.dependency*100).toFixed(0)}%`], suggestion: '加强品牌和市场沟通。', detectedAt: checkedAt }];
      if (r.dependency > 0.6) return [{ id: `i8-warn-${now.getTime()}`, severity: 'warning', title: `护城河认知差距 (${(r.dependency*100).toFixed(0)}%)`, description: '结构性壁垒强于感知壁垒。', evidence: [`差距: ${(r.dependency*100).toFixed(0)}%`], suggestion: '评估是否需要加强市场认知。', detectedAt: checkedAt }];
      return [];
    } catch (err: unknown) { log.error({ err }, '[moat-dependency] 失败'); return [{ id: `i8-error-${now.getTime()}`, severity: 'warning', title: '检测异常', description: `${(err as Error)?.message || String(err)}`, evidence: [], suggestion: '检查数据源。', detectedAt: checkedAt }]; }
  },
};
