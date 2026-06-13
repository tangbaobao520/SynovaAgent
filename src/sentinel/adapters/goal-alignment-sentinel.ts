/**
 * sentinel/adapters/goal-alignment-sentinel.ts — 目标对齐度哨兵
 * @state: skeleton — 数据管道就绪后升级为 real
 */
import type { Sentinel, SentinelCheckResult, SentinelConfig, SentinelContext, SentinelFinding } from '../types';
import { discoverTeams } from './helpers';
import { createLogger } from '../../logger';
const log = createLogger('sentinel/goal-alignment');
const config: SentinelConfig = {
  id: 'sentinel-goal-alignment', name: '目标对齐度', description: '检测组织-团队-个人目标之间的对齐偏差。',
  category: 'capability', priority: 'P2', mode: 'cron', cron: '0 9 * * 1',
  requiredDataSources: [], confidenceModel: 'deterministic', version: '1.0.0',
};
export const goalalignmentSentinel: Sentinel = {
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
