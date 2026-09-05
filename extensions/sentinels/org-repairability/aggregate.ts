import type { SentinelFinding } from '../../../src/sentinel/types';
import type { GraphTraversal } from '../../../src/l4/graph-traversal';
import { computeProblemActionCycle } from './computes/compute-problem-action-cycle';
import { createLogger } from '@synova/logger';

const log = createLogger('sentinel/org-repairability');

interface GraphStoreReader {
  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{
    id: string; type: string; props: Record<string, unknown>;
  }>;
}

export const orgRepairabilitySentinel = {
  async check(store: GraphStoreReader, teamId: string, traversal?: GraphTraversal): Promise<SentinelFinding[]> {
    const now = new Date();
    const checkedAt = now.toISOString();
    let eventNodes: Array<{ id: string; type: string; props: Record<string, unknown> }> = [];
    let usedTraversal = false;

    try {
      try { if (traversal) { const r = traversal.traverse([teamId], ['SIGNAL_TRANSMITS']); if (r.nodes[0]) { eventNodes = r.nodes.filter(n => n.type === 'EVENT'); usedTraversal = true; } } } catch (err: unknown) { log.warn({ err, teamId }, '图遍历失败 — 降级到旧路径'); }
      if (!usedTraversal) { eventNodes = store.queryNodes('Event', { teamId }); }

      // 提取事件数据 (含 problemCategory 和时间戳)
      const events = eventNodes.map(n => ({
        eventType: (n.props.eventType as string) || '',
        timestamp: (n.props.timestamp as string) || (n.props.date as string) || '',
        problemCategory: (n.props.problemCategory as string) || (n.props.category as string) || undefined,
        resolved: n.props.resolved === true || n.props.status === 'resolved' || n.props.status === 'fixed',
        resolvedAt: (n.props.resolvedAt as string) || (n.props.resolved_at as string) || undefined,
      }));

      const result = computeProblemActionCycle(events);
      log.debug({ repairCycleDays: result.repairCycleDays, recurrenceRate: result.recurrenceRate, signal: result.signal }, '问题-行动周期计算完成 (O8升级版)');

      if (result.degraded) {
        return [{ id: `o8-nodata`, severity: 'info', title: '无问题事件数据',
          description: '未检测到问题或故障事件。', evidence: [], suggestion: '建立问题记录机制。', detectedAt: checkedAt }];
      }

      const scorePct = (result.repairScore * 100).toFixed(0);

      if (result.signal === 'weak') {
        return [{ id: `o8-crit`, severity: 'critical',
          title: `组织修复能力弱 (${scorePct}分) — 修复周期${result.repairCycleDays}天, 复发率${(result.recurrenceRate * 100).toFixed(0)}%`,
          description: `共 ${result.totalProblems} 个问题，${result.totalResolved} 个已修复。修复周期中位数 ${result.repairCycleDays} 天，同类问题复发率 ${(result.recurrenceRate * 100).toFixed(0)}%。高复发率表明组织处于单环学习模式——修表面而非根因 (Argyris & Schön, 1978)。`,
          evidence: [`修复得分: ${scorePct}%`, `修复周期中位数: ${result.repairCycleDays}天`, `复发率: ${(result.recurrenceRate * 100).toFixed(0)}%`, `问题数: ${result.totalProblems}`, `已修复: ${result.totalResolved}`],
          suggestion: '建立双环学习机制——不仅修复问题，更要修改导致问题的治理变量。',
          detectedAt: checkedAt }];
      }

      if (result.signal === 'moderate') {
        return [{ id: `o8-warn`, severity: 'warning',
          title: `组织修复能力中等 (${scorePct}分) — 修复周期${result.repairCycleDays}天`,
          description: `修复周期中位数 ${result.repairCycleDays} 天，复发率 ${(result.recurrenceRate * 100).toFixed(0)}%。`,
          evidence: [`修复得分: ${scorePct}%`, `修复周期: ${result.repairCycleDays}天`, `复发率: ${(result.recurrenceRate * 100).toFixed(0)}%`],
          suggestion: '加快问题响应速度，建立根因分析机制。',
          detectedAt: checkedAt }];
      }

      return [{ id: `o8-healthy`, severity: 'info',
        title: `组织修复能力强 (${scorePct}分) — 修复周期${result.repairCycleDays}天, 复发率${(result.recurrenceRate * 100).toFixed(0)}%`,
        description: `修复周期中位数 ${result.repairCycleDays} 天，复发率 ${(result.recurrenceRate * 100).toFixed(0)}%。低复发率表明组织具有双环学习能力。`,
        evidence: [`修复得分: ${scorePct}%`, `修复周期: ${result.repairCycleDays}天`, `复发率: ${(result.recurrenceRate * 100).toFixed(0)}%`],
        suggestion: '维持当前问题管理机制。',
        detectedAt: checkedAt }];
    } catch (err: unknown) {
      log.error({ err }, '[org-repairability] 失败');
      return [{ id: `o8-error`, severity: 'warning', title: '检测异常',
        description: `${(err as Error)?.message || String(err)}`, evidence: [], suggestion: '检查数据。', detectedAt: checkedAt }];
    }
  },
};
