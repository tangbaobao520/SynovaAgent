/**
 * key-person-risk/aggregate.ts — 关键人风险哨兵聚合
 *
 * 包装 src/l3/key-person-risk.ts 的 checkKeyPersonRisk 到哨兵接口。
 */
import { checkKeyPersonRisk } from '../../../src/l3/key-person-risk';
import type { SentinelFinding } from '../../../src/sentinel/types';

interface GraphStoreReader {
  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{
    id: string; type: string; props: Record<string, unknown>;
  }>;
}

export default {
  async check(store: GraphStoreReader, teamId: string): Promise<SentinelFinding[]> {
    const result = checkKeyPersonRisk(store, teamId);
    return result.findings;
  },
};
