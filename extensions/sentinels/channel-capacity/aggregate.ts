import type { SentinelFinding } from '../../../src/sentinel/types';
import type { GraphTraversal } from '../../../src/l4/graph-traversal';
import { computeChannelCapacity } from './computes/compute-channel-capacity';
import { createLogger } from '@synova/logger';

const log = createLogger('sentinel/channel-capacity');

interface GraphStoreReader {
  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{
    id: string; type: string; props: Record<string, unknown>;
  }>;
}

export const channelCapacitySentinel = {
  async check(store: GraphStoreReader, teamId: string, traversal?: GraphTraversal): Promise<SentinelFinding[]> {
    const now = new Date();
    const checkedAt = now.toISOString();
    let personNodes: Array<{ id: string; type: string; props: Record<string, unknown> }> = [];
    let teamNodes: Array<{ id: string; type: string; props: Record<string, unknown> }> = [];
    let eventNodes: Array<{ id: string; type: string; props: Record<string, unknown> }> = [];
    let usedTraversal = false;

    try {
      // @deprecated — 语义迁移由D15处理
      try { if (traversal) { const r = traversal.traverse([teamId], ['DEPLOYS', 'SIGNAL_TRANSMITS']); if (r.nodes[0]) { personNodes = r.nodes.filter(n => n.type === 'PERSON'); teamNodes = r.nodes.filter(n => n.type === 'TEAM'); eventNodes = r.nodes.filter(n => n.type === 'EVENT'); usedTraversal = true; } } } catch (err: unknown) { log.warn({ err, teamId }, '图遍历失败 — 降级到旧路径'); }
      if (!usedTraversal) { personNodes = store.queryNodes('Person', { teamId }); teamNodes = store.queryNodes('Team', { teamId }); eventNodes = store.queryNodes('Event', { teamId }); }

      const result = computeChannelCapacity(personNodes.length, teamNodes.length, eventNodes.length);
      log.debug({ score: result.score, assessment: result.assessment }, '信道容量计算完成');

      if (result.degraded) {
        return [{ id: `o6-nodata`, severity: 'info', title: '数据不足',
          description: '未检测到人员、团队或事件数据。', evidence: [], suggestion: '添加组织数据。', detectedAt: checkedAt }];
      }

      const sp = (result.score * 100).toFixed(0);

      if (result.assessment === 'overloaded') {
        return [{ id: `o6-crit`, severity: 'warning', title: `组织信道过载 (${sp}%)`,
          description: `${result.personCount} 人, ${result.teamCount} 个团队, 人均 ${result.eventsPerPerson} 个事件。信息量超过组织处理能力。`,
          evidence: [`信道: ${sp}%`, `人均事件: ${result.eventsPerPerson}`],
          suggestion: '调整团队规模，优化沟通渠道。', detectedAt: checkedAt }];
      }

      if (result.assessment === 'underutilized') {
        return [{ id: `o6-warn`, severity: 'info', title: `信道利用不足 (${sp}%)`,
          description: '信息渠道未得到充分利用。', evidence: [`信道: ${sp}%`, `人均事件: ${result.eventsPerPerson}`],
          suggestion: '加强跨团队信息共享。', detectedAt: checkedAt }];
      }

      return [{ id: `o6-healthy`, severity: 'info', title: `信道容量健康 (${sp}%)`,
        description: '信息流通渠道容量充足。', evidence: [`信道: ${sp}%`],
        suggestion: '维持现状。', detectedAt: checkedAt }];
    } catch (err: unknown) {
      log.error({ err }, '[channel-capacity] 失败');
      return [{ id: `o6-error`, severity: 'warning', title: '检测异常',
        description: `${(err as Error)?.message || String(err)}`, evidence: [], suggestion: '检查数据。', detectedAt: checkedAt }];
    }
  },
};
