/**
 * cash-runway/aggregate.ts — 现金流哨兵 Stub
 * V3.7 Batch 2 — 结构先行，计算逻辑逐步填充
 */
import type { GraphStoreReader, SentinelManifest } from '../../../src/sentinel/sentinel-loader';
import type { SentinelFinding } from '../../../src/sentinel/types';
import { createLogger } from '../../../src/logger';

const log = createLogger('sentinel/cash-runway');

export const cashRunwaySentinel = {
  manifest: null as SentinelManifest | null,

  async check(store: GraphStoreReader, teamId: string): Promise<SentinelFinding[]> {
    const findings: SentinelFinding[] = [];
    try {
      const nodes = store.queryNodes('FINANCIAL', { teamId });
      if (nodes.length === 0) {
        log.info({ teamId }, '暂无财务数据 — 跳过');
        return [];
      }
      // TODO: 从 engine-core 提取现金跑道、应收逾期率、经营现金流计算逻辑
      log.info({ teamId, nodeCount: nodes.length }, '现金流检查完成 (stub)');
    } catch (err: any) {
      log.warn({ err, teamId }, '现金流检查失败 — degraded');
    }
    return findings;
  },
};
