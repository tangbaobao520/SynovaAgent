/**
 * margin-health/aggregate.ts — 利润健康哨兵(合并)
 *
 * 合并自 cost-health + profit-health。
 * 整合成本结构分析(毛利率/固定变动比/人均成本)和利润率趋势分析(变化率/行业基准对比)。
 * 源文件保留在 _extinct/ 作为审计参考。
 */
import type { SentinelFinding } from '../../../src/sentinel/types';
import type { GraphTraversal } from '../../../src/l4/graph-traversal';
import { createLogger } from '@synova/logger';

const log = createLogger('sentinel/margin-health');

interface GraphStoreReader {
  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{
    id: string; type: string; props: Record<string, unknown>;
  }>;
}

export const marginHealthSentinel = {
  async check(store: GraphStoreReader, teamId: string, traversal?: GraphTraversal): Promise<SentinelFinding[]> {
    const now = new Date();
    const findings: SentinelFinding[] = [];

    try {
      const { costHealthSentinel } = await import('../_extinct/cost-health/aggregate');
      const { profitHealthSentinel } = await import('../_extinct/profit-health/aggregate');

      const [r1, r2] = await Promise.all([
        costHealthSentinel.check(store, teamId, traversal).catch((err: unknown) => {
          log.warn({ err }, '[margin-health] cost-health 子检查失败');
          return [] as SentinelFinding[];
        }),
        profitHealthSentinel.check(store, teamId, traversal).catch((err: unknown) => {
          log.warn({ err }, '[margin-health] profit-health 子检查失败');
          return [] as SentinelFinding[];
        }),
      ]);

      findings.push(...r1, ...r2);
      log.debug({ totalFindings: findings.length }, '利润健康合并检查完成');
      return findings;
    } catch (err: unknown) {
      log.error({ err }, '[margin-health] check 失败');
      return [{
        id: `mh-error-${now.getTime()}`, severity: 'warning' as const,
        title: '利润健康检测异常',
        description: `${(err as Error)?.message || String(err)}`,
        evidence: [], suggestion: '检查源哨兵 aggregate.ts 和 Financial 数据源。',
        detectedAt: now.toISOString(),
      }];
    }
  },
};
