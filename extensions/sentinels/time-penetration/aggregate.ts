import type { SentinelFinding } from '../../../src/sentinel/types';
import type { GraphTraversal } from '../../../src/l4/graph-traversal';
import { computeTimePenetration } from './computes/time-penetration-score';
import { createLogger } from '@synova/logger';
const log = createLogger('sentinel/time-penetration');
interface GraphStoreReader { queryNodes(t: string, f?: Record<string, unknown>, g?: string): Array<{ id: string; type: string; props: Record<string, unknown> }>; }
export const timePenetrationSentinel = {
  async check(store: GraphStoreReader, teamId: string, traversal?: GraphTraversal): Promise<SentinelFinding[]> {
    const now = new Date(); const checkedAt = now.toISOString();
    try {
    let allNodeData: Array<{ id: string; type: string; props: Record<string, unknown> }> = [];
    let usedTraversal = false;
    try {
      if (traversal) { const r = traversal.traverse([teamId], ['SIGNAL_TRANSMITS']); if (r.nodes[0]) { allNodeData = r.nodes; usedTraversal = true; } }
    } catch (err: unknown) { log.warn({ err, teamId }, 'graph traversal failed - fallback'); }
      const events = store.queryNodes('Event', { teamId });
      const r = computeTimePenetration(events.length, 0);
      if (r.penetration < 0.2) return [{ id: `i9-crit-${now.getTime()}`, severity: 'critical', title: `时间穿透力弱 (${(r.penetration*100).toFixed(0)}%)`, description: '组织对外部变化响应迟缓。', evidence: [`穿透力: ${(r.penetration*100).toFixed(0)}%`], suggestion: '建立前瞻性监测机制。', detectedAt: checkedAt }];
      return [];
    } catch (err: unknown) { log.error({ err }, '[time-penetration] 失败'); return [{ id: `i9-error-${now.getTime()}`, severity: 'warning', title: '检测异常', description: `${(err as Error)?.message || String(err)}`, evidence: [], suggestion: '检查数据源。', detectedAt: checkedAt }]; }
  },
};
