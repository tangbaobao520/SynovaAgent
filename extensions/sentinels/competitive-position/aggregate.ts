/**
 * competitive-position/aggregate.ts — 竞争定位哨兵(合并)
 *
 * 合并自 competitive-dynamics(E3) + market-lifecycle(E1)。
 * 整合竞争格局变化和产业生命周期判定。
 * 源文件保留在 _extinct/ 作为审计参考。
 */
import type { SentinelFinding } from '../../../src/sentinel/types';
import type { GraphTraversal } from '../../../src/l4/graph-traversal';
import { createLogger } from '@synova/logger';

const log = createLogger('sentinel/competitive-position');

interface GraphStoreReader {
  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{
    id: string; type: string; props: Record<string, unknown>;
  }>;
}

export const competitivePositionSentinel = {
  async check(store: GraphStoreReader, teamId: string, traversal?: GraphTraversal): Promise<SentinelFinding[]> {
    const now = new Date();
    const findings: SentinelFinding[] = [];

    try {
      const { competitiveDynamicsSentinel } = await import('../_extinct/competitive-dynamics/aggregate');
      const { marketLifecycleSentinel } = await import('../_extinct/market-lifecycle/aggregate');

      const [r1, r2] = await Promise.all([
        competitiveDynamicsSentinel.check(store, teamId, traversal).catch((err: unknown) => {
          log.warn({ err }, '[competitive-position] competitive-dynamics 子检查失败');
          return [] as SentinelFinding[];
        }),
        marketLifecycleSentinel.check(store, teamId, traversal).catch((err: unknown) => {
          log.warn({ err }, '[competitive-position] market-lifecycle 子检查失败');
          return [] as SentinelFinding[];
        }),
      ]);

      findings.push(...r1, ...r2);
      log.debug({ totalFindings: findings.length }, '竞争定位合并检查完成');
      return findings;
    } catch (err: unknown) {
      log.error({ err }, '[competitive-position] check 失败');
      return [{
        id: `cp-error`, severity: 'warning' as const,
        title: '竞争定位检测异常',
        description: `${(err as Error)?.message || String(err)}`,
        evidence: [], suggestion: '检查源哨兵 aggregate.ts 和 Market/Financial 数据源。',
        detectedAt: now.toISOString(),
      }];
    }
  },
};
