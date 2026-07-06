import type { SentinelFinding } from '../../../src/sentinel/types';
import type { GraphTraversal } from '../../../src/l4/graph-traversal';
import { computeIncentiveAlignment } from './computes/compute-incentive-alignment';
import { createLogger } from '@synova/logger';

const log = createLogger('sentinel/incentive-alignment');

interface GraphStoreReader {
  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{
    id: string; type: string; props: Record<string, unknown>;
  }>;
}

export const incentiveAlignmentSentinel = {
  async check(store: GraphStoreReader, teamId: string, traversal?: GraphTraversal): Promise<SentinelFinding[]> {
    const now = new Date();
    const checkedAt = now.toISOString();
    let personNodes: Array<{ id: string; type: string; props: Record<string, unknown> }> = [];
    let eventNodes: Array<{ id: string; type: string; props: Record<string, unknown> }> = [];
    let usedTraversal = false;

    try {
      try { if (traversal) { const r = traversal.traverse([teamId], ['INFORMS', 'SIGNAL_TRANSMITS']); if (r.nodes[0]) { personNodes = r.nodes.filter(n => n.type === 'PERSON'); eventNodes = r.nodes.filter(n => n.type === 'EVENT'); usedTraversal = true; } } } catch (err: unknown) { log.warn({ err, teamId }, '图遍历失败 — 降级到旧路径'); }
      if (!usedTraversal) { personNodes = store.queryNodes('Person', { teamId }); eventNodes = store.queryNodes('Event', { teamId }); }

      // 激励数据从 Person 节点的 incentive_type/compensation_model 字段读取
      const goals = personNodes
        .filter(n => n.props.incentiveType || n.props.compensationModel || n.props.role)
        .map(n => ({
          goalType: (n.props.incentiveType as string) || (n.props.compensationModel as string) || (n.props.role as string) || 'unknown',
        }));
      const events = eventNodes.map(n => ({
        eventType: n.props.eventType as string | undefined,
      }));

      const result = computeIncentiveAlignment(goals, events);
      log.debug({ score: result.score, assessment: result.assessment }, '激励对齐度计算完成');

      if (result.degraded) {
        return [{
          id: `o3-nodata-${now.getTime()}`, severity: 'info',
          title: '激励与目标数据不足',
          description: '未检测到 Person 或 Event 节点。',
          evidence: [], suggestion: '补充人员激励和事件数据。',
          detectedAt: checkedAt,
        }];
      }

      const scorePct = (result.score * 100).toFixed(0);

      if (result.assessment === 'misaligned') {
        return [{
          id: `o3-crit-${now.getTime()}`, severity: 'critical',
          title: `激励与增长目标不匹配 (${scorePct}%)`,
          description: `激励体系与增长目标存在显著偏差。增长目标占 ${(result.growthGoalRatio * 100).toFixed(0)}%，但短期激励事件占 ${(result.shortTermIncentiveRatio * 100).toFixed(0)}%。`,
          evidence: [`对齐度: ${scorePct}%`, `增长目标: ${(result.growthGoalRatio * 100).toFixed(0)}%`, `短期激励: ${(result.shortTermIncentiveRatio * 100).toFixed(0)}%`],
          suggestion: '重新设计激励体系，将考核指标与长期增长目标对齐。',
          detectedAt: checkedAt,
        }];
      }

      if (result.assessment === 'partially') {
        return [{
          id: `o3-warn-${now.getTime()}`, severity: 'warning',
          title: `激励对齐度有待提升 (${scorePct}%)`,
          description: '部分激励与增长目标不一致。',
          evidence: [`对齐度: ${scorePct}%`, `增长目标: ${(result.growthGoalRatio * 100).toFixed(0)}%`],
          suggestion: '审查考核指标，增加长期价值导向的激励。',
          detectedAt: checkedAt,
        }];
      }

      return [{
        id: `o3-healthy-${now.getTime()}`, severity: 'info',
        title: `激励与增长目标对齐 (${scorePct}%)`,
        description: '激励体系与增长目标一致。',
        evidence: [`对齐度: ${scorePct}%`, `增长目标: ${(result.growthGoalRatio * 100).toFixed(0)}%`],
        suggestion: '维持当前激励设计，定期审视。',
        detectedAt: checkedAt,
      }];
    } catch (err: unknown) {
      log.error({ err }, '[incentive-alignment] check 失败');
      return [{
        id: `o3-error-${now.getTime()}`, severity: 'warning',
        title: '激励对齐度检测异常', description: `${(err as Error)?.message || String(err)}`,
        evidence: [], suggestion: '检查数据源。', detectedAt: checkedAt,
      }];
    }
  },
};
