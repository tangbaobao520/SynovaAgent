/**
 * capital-health/aggregate.ts — 资本健康哨兵(合并)
 *
 * 合并自 capital-efficiency(F3) + capital-structure(F2) + capital-turnover(F5)。
 * 整合源哨兵 check() 结果，合并为统一 Finding[]。
 * 源文件保留在 _extinct/ 作为审计参考。
 */
import type { SentinelFinding } from '../../../src/sentinel/types';
import type { GraphTraversal } from '../../../src/l4/graph-traversal';
import { createLogger } from '@synova/logger';

const log = createLogger('sentinel/capital-health');

interface GraphStoreReader {
  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{
    id: string; type: string; props: Record<string, unknown>;
  }>;
}

export const capitalHealthSentinel = {
  async check(store: GraphStoreReader, teamId: string, traversal?: GraphTraversal): Promise<SentinelFinding[]> {
    const now = new Date();
    const findings: SentinelFinding[] = [];

    try {
      // 动态 import 源哨兵 aggregate（保留在 _extinct/）
      const { capitalEfficiencySentinel } = await import('../_extinct/capital-efficiency/aggregate');
      const { capitalStructureSentinel } = await import('../_extinct/capital-structure/aggregate');
      const { capitalTurnoverSentinel } = await import('../_extinct/capital-turnover/aggregate');

      const [r1, r2, r3] = await Promise.all([
        capitalEfficiencySentinel.check(store, teamId, traversal).catch((err: unknown) => {
          log.warn({ err }, '[capital-health] capital-efficiency 子检查失败');
          return [] as SentinelFinding[];
        }),
        capitalStructureSentinel.check(store, teamId, traversal).catch((err: unknown) => {
          log.warn({ err }, '[capital-health] capital-structure 子检查失败');
          return [] as SentinelFinding[];
        }),
        capitalTurnoverSentinel.check(store, teamId, traversal).catch((err: unknown) => {
          log.warn({ err }, '[capital-health] capital-turnover 子检查失败');
          return [] as SentinelFinding[];
        }),
      ]);

      findings.push(...r1, ...r2, ...r3);
      log.debug({ totalFindings: findings.length }, '资本健康合并检查完成');
      return findings;
    } catch (err: unknown) {
      log.error({ err }, '[capital-health] check 失败');
      return [{
        id: `ch-error-${now.getTime()}`, severity: 'warning' as const,
        title: '资本健康检测异常',
        description: `${(err as Error)?.message || String(err)}`,
        evidence: [], suggestion: '检查源哨兵 aggregate.ts 和 Financial 数据源。',
        detectedAt: now.toISOString(),
      }];
    }
  },
};
