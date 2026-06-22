/**
 * profit-health/aggregate.ts — 利润健康哨兵 Stub
 * V3.7 Batch 2 — 结构先行，计算逻辑逐步填充
 */
import type { GraphStoreReader, SentinelManifest } from '../../../src/sentinel/sentinel-loader';
import type { SentinelFinding } from '../../../src/sentinel/types';
import { createLogger } from '../../../src/logger';

const log = createLogger('sentinel/profit-health');

export const profitHealthSentinel = {
  manifest: null as SentinelManifest | null,

  async check(store: GraphStoreReader, teamId: string): Promise<SentinelFinding[]> {
    const findings: SentinelFinding[] = [];
    try {
      const nodes = store.queryNodes('FINANCIAL', { teamId });
      if (nodes.length === 0) {
        log.info({ teamId }, '暂无财务数据 — 跳过');
        return [];
      }
      // TODO: 从 engine-core 提取利润率变化、行业对标计算逻辑
      log.info({ teamId, nodeCount: nodes.length }, '利润健康检查完成 (stub)');
    } catch (err: any) {
      log.warn({ err, teamId }, '利润健康检查失败 — degraded');
    }
    return findings;
  },
};
