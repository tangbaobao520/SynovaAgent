import type { SentinelFinding } from '../../../src/sentinel/types';
import type { GraphTraversal } from '../../../src/l4/graph-traversal';
import { computeModelCoherence } from './computes/model-consistency-score';
import { createLogger } from '@synova/logger';
const log = createLogger('sentinel/bizmodel-coherence');
interface GraphStoreReader { queryNodes(t: string, f?: Record<string, unknown>, g?: string): Array<{ id: string; type: string; props: Record<string, unknown> }>; }
export const businessModelCoherenceSentinel = {
  async check(store: GraphStoreReader, teamId: string, traversal?: GraphTraversal): Promise<SentinelFinding[]> {
    const now = new Date(); const checkedAt = now.toISOString();
    let allNodes: Array<{ id: string; type: string; props: Record<string, unknown> }> = [];
    let usedTraversal = false;
    try {
      try { if (traversal) { const r = traversal.traverse([teamId], ['FUNDS', 'DEPLOYS', 'OPERATIONAL_EXECUTION']); if (r.nodes[0]) { allNodes = r.nodes; usedTraversal = true; } } } catch (err: unknown) { log.warn({ err, teamId }, '图遍历失败 — 降级到旧路径'); }
      if (!usedTraversal) { allNodes = (store.queryNodes('Event', { teamId }) || []).concat(store.queryNodes('Tool', { teamId })).concat(store.queryNodes('Client', { teamId })).concat(store.queryNodes('Person', { teamId })).concat(store.queryNodes('Financial', { teamId })); }
      const r = computeModelCoherence(allNodes);
      log.debug({ coherence: r.score }, '商业模式一致性计算完成');
      if (r.score < 0.2) return [{ id: `i7-crit-${now.getTime()}`, severity: 'critical', title: `商业模式一致性低 (${(r.score*100).toFixed(0)}%)`, description: '价值主张-收入-成本结构存在明显不一致。', evidence: [`一致性: ${(r.score*100).toFixed(0)}%`, ...r.signals], suggestion: '审视核心价值主张与收入模式的匹配度。', detectedAt: checkedAt }];
      if (r.score < 0.4) return [{ id: `i7-warn-${now.getTime()}`, severity: 'warning', title: `商业模式一致性偏低 (${(r.score*100).toFixed(0)}%)`, description: '部分维度存在不匹配。', evidence: [`一致性: ${(r.score*100).toFixed(0)}%`, ...r.signals], suggestion: '优化收入模式或成本结构。', detectedAt: checkedAt }];
      if (r.signals.length > 0) return [{ id: `i7-info-${now.getTime()}`, severity: 'info', title: `商业模式一致性 (${(r.score*100).toFixed(0)}%)`, description: '基础一致但部分定义缺失。', evidence: r.signals, suggestion: '补充缺失的商业模式定义。', detectedAt: checkedAt }];
      return [];
    } catch (err: unknown) { log.error({ err }, '[bizmodel-coherence] 失败'); return [{ id: `i7-error-${now.getTime()}`, severity: 'warning', title: '检测异常', description: `${(err as Error)?.message || String(err)}`, evidence: [], suggestion: '检查数据源。', detectedAt: checkedAt }]; }
  },
};
