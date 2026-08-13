/**
 * opportunity-window/aggregate.ts — E2 结构性机会窗口哨兵
 */
import type { SentinelFinding } from '../../../src/sentinel/types';
import type { GraphTraversal } from '../../../src/l4/graph-traversal';
import { computeOpportunityWindowScore } from './computes/opportunity-window-score';
import { createLogger } from '@synova/logger';

const log = createLogger('sentinel/opportunity-window');

interface GraphStoreReader {
  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{
    id: string; type: string; props: Record<string, unknown>;
  }>;
}

export const opportunityWindowSentinel = {
  async check(store: GraphStoreReader, teamId: string, traversal?: GraphTraversal): Promise<SentinelFinding[]> {
    const now = new Date();
    const checkedAt = now.toISOString();
    const findings: SentinelFinding[] = [];

    try {
      // @deprecated — 语义迁移由D15处理
      if (traversal) { const r = traversal.traverse([teamId], ['DEPLOYS']); if (!r.nodes[0]) return []; }
      const eventNodes = store.queryNodes('Event', { teamId });
      const toolNodes = store.queryNodes('Tool', { teamId });

      const events = [
        ...eventNodes.map(n => ({ type: n.type, eventType: n.props.eventType as string, description: n.props.description as string })),
        ...toolNodes.map(n => ({ type: n.type, eventType: 'technology_change', description: n.props.name as string })),
      ];

      const result = computeOpportunityWindowScore(events);
      if (result.degraded) { log.warn({ teamId }, 'compute degraded — data incomplete'); return []; }
      log.debug({ score: result.score, signals: result.signals.length }, '机会窗口评分完成');

      const scorePct = (result.score * 100).toFixed(0);

      if (result.score < 0.2) {
        findings.push({
          id: `e2-low-${now.getTime()}`, severity: 'warning',
          title: `结构性变化机会少 (${scorePct}%)`,
          description: '外部环境相对稳定，无明显技术/法规/竞争变化信号。',
          evidence: result.signals.length > 0 ? result.signals : ['无显著变化信号'],
          suggestion: '专注内部优化和效率提升。',
          detectedAt: checkedAt,
        });
      } else if (result.score > 0.7) {
        findings.push({
          id: `e2-high-${now.getTime()}`, severity: 'info',
          title: `结构性机会窗口打开 (${scorePct}%)`,
          description: `检测到 ${result.techChangeSignals + result.regulatorySignals + result.competitiveSignals} 个结构性变化信号。`,
          evidence: result.signals,
          suggestion: '评估这些变化是否为企业带来战略机遇。',
          detectedAt: checkedAt,
        });
      }

      return findings;
    } catch (err: unknown) {
      log.error({ err }, '[opportunity-window] check 失败');
      return [{
        id: `e2-error-${now.getTime()}`, severity: 'warning',
        title: '机会窗口检测异常', description: `${(err as Error)?.message || String(err)}`,
        evidence: [], suggestion: '检查数据源。', detectedAt: checkedAt,
      }];
    }
  },
};
