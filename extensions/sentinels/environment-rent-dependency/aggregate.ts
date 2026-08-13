/**
 * environment-rent-dependency/aggregate.ts — E5 环境红利依赖性哨兵
 */
import type { SentinelFinding } from '../../../src/sentinel/types';
import type { GraphTraversal } from '../../../src/l4/graph-traversal';
import { computeRentDependencyIndex } from './computes/rent-dependency-index';
import { createLogger } from '@synova/logger';

const log = createLogger('sentinel/rent-dependency');

interface GraphStoreReader { queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{ id: string; type: string; props: Record<string, unknown>; }>; }

export const environmentRentDependencySentinel = {
  async check(store: GraphStoreReader, teamId: string, traversal?: GraphTraversal): Promise<SentinelFinding[]> {
    const now = new Date(); const checkedAt = now.toISOString();
    let finNodes: Array<{ id: string; type: string; props: Record<string, unknown> }> = [];
    let usedTraversal = false;
    try {
      // @deprecated — 语义迁移由D15处理
      try { if (traversal) { const r = traversal.traverse([teamId], ['FUNDS', 'OPERATIONAL_EXECUTION']); if (r.nodes[0]) { finNodes = r.nodes; usedTraversal = true; } } } catch (err: unknown) { log.warn({ err, teamId }, '图遍历失败 — 降级到旧路径'); }
      if (!usedTraversal) { finNodes = store.queryNodes('Financial', { teamId }); }
      const financials = finNodes.map(n => ({ type: (n.props.financialType as string) || (n.props.type as string) || 'revenue', value: Number(n.props.amount) || 0 }));
      const result = computeRentDependencyIndex(financials);
      log.debug({ index: result.index }, '环境红利依赖计算完成');

      if (result.index > 0.5) {
        return [{ id: `e5-rent-${now.getTime()}`, severity: 'critical', title: `环境红利依赖度过高 (${(result.index * 100).toFixed(0)}%)`, description: `企业过度依赖外部环境红利。`, evidence: result.signals, suggestion: '建立独立于外部红利的核心竞争力。', detectedAt: checkedAt }];
      } else if (result.index > 0.3) {
        return [{ id: `e5-rent-warn-${now.getTime()}`, severity: 'warning', title: `环境红利依赖中等 (${(result.index * 100).toFixed(0)}%)`, description: '部分营收依赖外部红利。', evidence: result.signals, suggestion: '评估外部红利可持续性。', detectedAt: checkedAt }];
      }
      return [];
    } catch (err: unknown) {
      log.error({ err }, '[rent-dependency] check 失败');
      return [{ id: `e5-error-${now.getTime()}`, severity: 'warning', title: '环境红利检测异常', description: `${(err as Error)?.message || String(err)}`, evidence: [], suggestion: '检查数据源。', detectedAt: checkedAt }];
    }
  },
};
