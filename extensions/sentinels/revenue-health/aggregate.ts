/**
 * revenue-health/aggregate.ts — 收入健康哨兵 Stub
 * V3.7 Batch 2 — 结构先行，计算逻辑逐步填充
 */
import type { GraphStoreReader, SentinelManifest } from '../../../src/sentinel/sentinel-loader';
import type { SentinelFinding } from '../../../src/sentinel/types';
import { createLogger } from '../../../src/logger';

const log = createLogger('sentinel/revenue-health');

export const revenueHealthSentinel = {
  manifest: null as SentinelManifest | null,

  async check(store: GraphStoreReader, teamId: string): Promise<SentinelFinding[]> {
    const findings: SentinelFinding[] = [];
    try {
      const nodes = store.queryNodes('FINANCIAL', { teamId });
      const revenueNodes = nodes.filter(n => (n.props.financialType as string) === 'revenue');
      if (revenueNodes.length === 0) {
        log.info({ teamId }, '暂无收入数据 — 跳过');
        return [];
      }
      // TODO: 从 engine-core 提取收入增长率、客户集中度、客单价计算逻辑
      log.info({ teamId, nodeCount: revenueNodes.length }, '收入健康检查完成 (stub)');
    } catch (err: any) {
      log.warn({ err, teamId }, '收入健康检查失败 — degraded');
    }
    return findings;
  },
};
