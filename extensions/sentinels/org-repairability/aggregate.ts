import type { SentinelFinding } from '../../../src/sentinel/types';
import { computeOrgRepairability } from './computes/compute-org-repairability';
import { createLogger } from '../../../src/logger';

const log = createLogger('sentinel/org-repairability');

interface GraphStoreReader {
  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{
    id: string; type: string; props: Record<string, unknown>;
  }>;
}

export const orgRepairabilitySentinel = {
  async check(store: GraphStoreReader, teamId: string): Promise<SentinelFinding[]> {
    const now = new Date();
    const checkedAt = now.toISOString();

    try {
      const eventNodes = store.queryNodes('Event', { teamId });

      // 问题类事件
      const problems = eventNodes.filter(n => {
        const type = (n.props.eventType as string || '').toLowerCase();
        return type.includes('problem') || type.includes('error') || type.includes('incident') ||
               type.includes('failure') || type.includes('bug') || type.includes('complaint');
      });

      // 已解决 (有 resolved 标记或 status=resolved)
      const resolved = problems.filter(n =>
        n.props.resolved === true || n.props.status === 'resolved' || n.props.status === 'fixed'
      );

      const result = computeOrgRepairability(problems.length, resolved.length);
      log.debug({ score: result.score, repairRate: result.repairRate }, '修复能力计算完成');

      if (result.degraded) {
        return [{ id: `o8-nodata-${now.getTime()}`, severity: 'info', title: '无问题事件数据',
          description: '未检测到问题或故障事件。', evidence: [], suggestion: '建立问题记录机制。', detectedAt: checkedAt }];
      }

      const sp = (result.score * 100).toFixed(0);

      if (result.assessment === 'weak') {
        return [{ id: `o8-crit-${now.getTime()}`, severity: 'critical', title: `组织修复能力弱 (${sp}%)`,
          description: `${result.problemCount} 个问题中仅修复 ${result.repairedCount} 个，修复率 ${(result.repairRate * 100).toFixed(0)}%。`,
          evidence: [`修复能力: ${sp}%`, `修复率: ${(result.repairRate * 100).toFixed(0)}%`, `未修复: ${result.problemCount - result.repairedCount}`],
          suggestion: '建立问题跟踪和修复流程，设定修复 SLA。', detectedAt: checkedAt }];
      }

      if (result.assessment === 'moderate') {
        return [{ id: `o8-warn-${now.getTime()}`, severity: 'warning', title: `组织修复能力中等 (${sp}%)`,
          description: `修复率 ${(result.repairRate * 100).toFixed(0)}%，仍需提升。`,
          evidence: [`修复能力: ${sp}%`, `修复率: ${(result.repairRate * 100).toFixed(0)}%`],
          suggestion: '加快问题响应和修复速度。', detectedAt: checkedAt }];
      }

      return [{ id: `o8-healthy-${now.getTime()}`, severity: 'info', title: `组织修复能力强 (${sp}%)`,
        description: `修复率 ${(result.repairRate * 100).toFixed(0)}%，问题能够被及时修复。`,
        evidence: [`修复能力: ${sp}%`, `修复率: ${(result.repairRate * 100).toFixed(0)}%`],
        suggestion: '维持当前问题管理机制。', detectedAt: checkedAt }];
    } catch (err: unknown) {
      log.error({ err }, '[org-repairability] 失败');
      return [{ id: `o8-error-${now.getTime()}`, severity: 'warning', title: '检测异常',
        description: `${(err as Error)?.message || String(err)}`, evidence: [], suggestion: '检查数据。', detectedAt: checkedAt }];
    }
  },
};
