/**
 * sentinel/adapters/financial-snapshot-sentinel.ts — 财务快照哨兵
 * @state: skeleton — 数据管道就绪后升级为 real
 */
import type { Sentinel, SentinelCheckResult, SentinelConfig, SentinelContext, SentinelFinding } from '../types';
import { discoverTeams } from './helpers';
import { createLogger } from '../../logger';
const log = createLogger('sentinel/financial-snapshot');
const config: SentinelConfig = {
  id: 'sentinel-financial-snapshot', name: '财务快照', description: '计算毛利率、人均收入、YoY增长等关键财务比率。',
  category: 'risk', priority: 'P2', mode: 'cron', cron: '0 9 1 * *',
  requiredDataSources: [], confidenceModel: 'deterministic', version: '1.0.0',
};
export const financialsnapshotSentinel: Sentinel = {
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
