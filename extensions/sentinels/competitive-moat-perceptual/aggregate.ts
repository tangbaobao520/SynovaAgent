import type { SentinelFinding } from '../../../src/sentinel/types';
import type { GraphTraversal } from '../../../src/l4/graph-traversal';
import { computeBrandPremium } from './computes/brand-premium';
import { computeCustomerLoyalty } from './computes/customer-loyalty';
import { createLogger } from '@synova/logger';
const log = createLogger('sentinel/moat-perceptual');
interface GraphStoreReader { queryNodes(t: string, f?: Record<string, unknown>, g?: string): Array<{ id: string; type: string; props: Record<string, unknown> }>; }
export const competitiveMoatPerceptualSentinel = {
  async check(store: GraphStoreReader, teamId: string, traversal?: GraphTraversal): Promise<SentinelFinding[]> {
    const now = new Date(); const checkedAt = now.toISOString();
    try {
      if (traversal) { const r = traversal.traverse([teamId], ['DEPLOYS']); if (!r.nodes[0]) return []; }
      const toolNodes = store.queryNodes('Tool', { teamId });
      const clientNodes = store.queryNodes('Client', { teamId });
      const products = toolNodes.map(n => ({ name: (n.props.name as string) || n.id, price: Number(n.props.price) || 0, category: (n.props.category as string) || 'default' }));
      const clients = clientNodes.map(n => ({ nps: Number(n.props.nps) || undefined, tenure: Number(n.props.tenure) || undefined, revenue: Number(n.props.revenue) || 0 }));
      const bp = computeBrandPremium(products);
      if (bp.degraded) { log.warn({ teamId }, 'brand premium degraded — using 0'); }
      const cl = computeCustomerLoyalty(clients);
      if (cl.degraded) { log.warn({ teamId }, 'customer loyalty degraded — using 0'); }
      const score = (bp.premium + cl.loyalty) / 2;
      if (score < 0.2) return [{ id: `i4-crit-${now.getTime()}`, severity: 'critical', title: `护城河感知弱 (${(score*100).toFixed(0)}%)`, description: '品牌溢价和客户忠诚度低。', evidence: [`品牌溢价: ${(bp.premium*100).toFixed(0)}%`, `忠诚度: ${(cl.loyalty*100).toFixed(0)}%`], suggestion: '投资品牌建设和客户体验。', detectedAt: checkedAt }];
      if (score < 0.4) return [{ id: `i4-warn-${now.getTime()}`, severity: 'warning', title: `护城河感知偏弱 (${(score*100).toFixed(0)}%)`, description: '感知壁垒不够强。', evidence: [`品牌溢价: ${(bp.premium*100).toFixed(0)}%`, `忠诚度: ${(cl.loyalty*100).toFixed(0)}%`], suggestion: '强化品牌差异化。', detectedAt: checkedAt }];
      return [];
    } catch (err: unknown) { log.error({ err }, '[moat-perceptual] 失败'); return [{ id: `i4-error-${now.getTime()}`, severity: 'warning', title: '检测异常', description: `${(err as Error)?.message || String(err)}`, evidence: [], suggestion: '检查数据源。', detectedAt: checkedAt }]; }
  },
};
