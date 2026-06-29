import type { SentinelFinding } from '../../../src/sentinel/types';
import { computeResourceMisallocation } from './computes/compute-resource-misallocation';
import { createLogger } from '@synova/logger';

const log = createLogger('sentinel/resource-misallocation');

interface GraphStoreReader {
  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{
    id: string; type: string; props: Record<string, unknown>;
  }>;
}

export const resourceMisallocationSentinel = {
  async check(store: GraphStoreReader, teamId: string): Promise<SentinelFinding[]> {
    const now = new Date();
    const checkedAt = now.toISOString();

    try {
      const goalNodes = store.queryNodes('Goal', { teamId });
      const personNodes = store.queryNodes('Person', { teamId });
      const finNodes = store.queryNodes('FINANCIAL', { teamId });

      const goals = goalNodes.map(n => ({
        name: (n.props.name as string) || n.id,
        priority: n.props.priority !== undefined ? Number(n.props.priority) : 3,
        area: (n.props.area as string) || (n.props.category as string) || '',
      }));

      const resources = [
        ...personNodes.map(n => ({
          goalArea: (n.props.dept as string) || (n.props.area as string) || 'general',
          headcount: 1,
          budget: 0,
        })),
        ...finNodes.map(n => ({
          goalArea: (n.props.category as string) || 'finance',
          headcount: 0,
          budget: Number(n.props.amount) || Number(n.props.revenue) || 0,
        })),
      ];

      const result = computeResourceMisallocation(goals, resources);
      log.debug({ index: result.index }, '资源错配计算完成');

      if (result.index > 0.5) {
        return [{
          id: `s3-crit-${now.getTime()}`, severity: 'critical',
          title: `资源错配严重 (${(result.index * 100).toFixed(0)}%)`,
          description: `${result.underfundedGoals.length} 个高优目标缺资源，${result.overstaffedAreas.length} 个领域可能资源过剩。`,
          evidence: [`错配指数: ${(result.index * 100).toFixed(0)}%`, `缺资源目标: ${result.underfundedGoals.join(', ') || '无'}`, `可能过剩: ${result.overstaffedAreas.join(', ') || '无'}`],
          suggestion: '重新评估资源分配与战略优先级的一致性。',
          detectedAt: checkedAt,
        }];
      }

      if (result.index > 0.2) {
        return [{
          id: `s3-warn-${now.getTime()}`, severity: 'warning',
          title: `资源错配 (${(result.index * 100).toFixed(0)}%)`,
          description: '部分资源分配与战略目标不匹配。',
          evidence: [`错配指数: ${(result.index * 100).toFixed(0)}%`, ...result.underfundedGoals.map(g => `${g}: 缺资源`)],
          suggestion: '审查资源分配，确保高优目标有足够支持。',
          detectedAt: checkedAt,
        }];
      }

      return [];
    } catch (err: unknown) {
      log.error({ err }, '[resource-misallocation] check 失败');
      return [{
        id: `s3-error-${now.getTime()}`, severity: 'warning',
        title: '资源错配检测异常', description: `${(err as Error)?.message || String(err)}`,
        evidence: [], suggestion: '检查数据源。', detectedAt: checkedAt,
      }];
    }
  },
};
