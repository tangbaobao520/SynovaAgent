/**
 * sentinel/adapters/risk-aggregator-sentinel.ts — 风险聚合哨兵
 * @state: skeleton — 数据管道就绪后升级为 real
 */
import type { Sentinel, SentinelCheckResult, SentinelConfig, SentinelContext, SentinelFinding } from '../types';
import { discoverTeams } from './helpers';
import { createLogger } from '../../logger';
const log = createLogger('sentinel/risk-aggregator');
const config: SentinelConfig = {
  id: 'sentinel-risk-aggregator', name: '风险聚合', description: '遍历Risk节点生成风险热力图+TopN排序。',
  category: 'risk', priority: 'P2', mode: 'cron', cron: '0 9 * * 1',
  requiredDataSources: [], confidenceModel: 'deterministic', version: '1.0.0',
};
export const riskaggregatorSentinel: Sentinel = {
  config,
  async check(context: SentinelContext): Promise<SentinelCheckResult> {
    const { now } = context; const checkedAt = now.toISOString();
    try {
      const teams = discoverTeams(context);
      if (teams.length === 0) return { sentinelId: config.id, ok: true, findings: [], durationMs: 0, checkedAt, degraded: true };
      log.debug('[${config.name}] 数据管道未就绪 — 降级');
      return { sentinelId: config.id, ok: true, findings: [], durationMs: Date.now() - now.getTime(), checkedAt, degraded: true };
    } catch (err: unknown) {
      return { sentinelId: config.id, ok: false, findings: [], durationMs: 0, checkedAt, error: (err as Error)?.message || String(err), degraded: true };
    }
  },
};
