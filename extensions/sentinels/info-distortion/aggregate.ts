import type { SentinelFinding } from '../../../src/sentinel/types';
import type { GraphTraversal } from '../../../src/l4/graph-traversal';
import { computeInfoDistortion } from './computes/compute-info-distortion';
import { createLogger } from '@synova/logger';

const log = createLogger('sentinel/info-distortion');

interface GraphStoreReader {
  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{
    id: string; type: string; props: Record<string, unknown>;
  }>;
}

export const infoDistortionSentinel = {
  async check(store: GraphStoreReader, teamId: string, traversal?: GraphTraversal): Promise<SentinelFinding[]> {
    const now = new Date();
    const checkedAt = now.toISOString();
    let personNodes: Array<{ id: string; type: string; props: Record<string, unknown> }> = [];
    let eventNodes: Array<{ id: string; type: string; props: Record<string, unknown> }> = [];
    let usedTraversal = false;

    try {
      // @deprecated — 语义迁移由D15处理
      try { if (traversal) { const r = traversal.traverse([teamId], ['DEPLOYS', 'SIGNAL_TRANSMITS']); if (r.nodes[0]) { personNodes = r.nodes.filter(n => n.type === 'PERSON'); eventNodes = r.nodes.filter(n => n.type === 'EVENT'); usedTraversal = true; } } } catch (err: unknown) { log.warn({ err, teamId }, '图遍历失败 — 降级到旧路径'); }
      if (!usedTraversal) { personNodes = store.queryNodes('Person', { teamId }); eventNodes = store.queryNodes('Event', { teamId }); }

      // 统计管理者（有 manager/reportsTo 字段的人员）
      const managerCount = personNodes.filter(n =>
        n.props.manager !== undefined || n.props.reportsTo !== undefined || n.props.isManager === true
      ).length;

      // 统计沟通故障事件
      const failureEvents = eventNodes.filter(n => {
        const type = (n.props.eventType as string || '').toLowerCase();
        return type.includes('problem') || type.includes('conflict') || type.includes('error') ||
               type.includes('miscommunication') || type.includes('complaint');
      }).length;

      const result = computeInfoDistortion(
        personNodes.length,
        managerCount,
        eventNodes.length,
        failureEvents
      );
      log.debug({ distortion: result.distortionRate, depth: result.orgDepth }, '信息失真率计算完成');

      if (result.degraded) {
        return [{ id: `o7-nodata-${now.getTime()}`, severity: 'info', title: '数据不足',
          description: '未检测到人员和事件数据。', evidence: [], suggestion: '添加组织数据。', detectedAt: checkedAt }];
      }

      const drPct = (result.distortionRate * 100).toFixed(0);

      if (result.assessment === 'high') {
        return [{ id: `o7-crit-${now.getTime()}`, severity: 'critical', title: `信息失真率高 (${drPct}%)`,
          description: `${result.orgDepth} 个管理层级, ${result.communicationFailures} 起沟通故障事件。信息在传递中严重变形。`,
          evidence: [`失真率: ${drPct}%`, `管理层级: ${result.orgDepth}`, `沟通故障: ${result.communicationFailures}`],
          suggestion: '减少管理层级，建立信息确认和反馈机制。', detectedAt: checkedAt }];
      }

      if (result.assessment === 'moderate') {
        return [{ id: `o7-warn-${now.getTime()}`, severity: 'warning', title: `信息失真率中等 (${drPct}%)`,
          description: '部分信息可能在传递中丢失或变形。', evidence: [`失真率: ${drPct}%`],
          suggestion: '审视信息传递路径，减少中间环节。', detectedAt: checkedAt }];
      }

      return [{ id: `o7-healthy-${now.getTime()}`, severity: 'info', title: `信息失真率低 (${drPct}%)`,
        description: '组织信息传递清晰。', evidence: [`失真率: ${drPct}%`],
        suggestion: '维持现状。', detectedAt: checkedAt }];
    } catch (err: unknown) {
      log.error({ err }, '[info-distortion] 失败');
      return [{ id: `o7-error-${now.getTime()}`, severity: 'warning', title: '检测异常',
        description: `${(err as Error)?.message || String(err)}`, evidence: [], suggestion: '检查数据。', detectedAt: checkedAt }];
    }
  },
};
