/**
 * agent/sentinel-health-service.ts — Sentinel 健康数据服务 (L2)
 * @state: real
 *
 * L2 编排层对 L1 暴露的哨兵健康接口。
 * L1 (routes/) 通过此服务获取哨兵状态，不直接访问 L3 (sentinel/)。
 *
 * 铁律 39: L1→L2 ✅ | L2→L3 ✅
 */

import { getSentinelRegistry } from '../sentinel/registry';
import { getBaselineStore } from '../sentinel/baseline-store';

export interface SentinelHealthReport {
  ok: boolean;
  summary: {
    total: number;
    byCategory: Record<string, number>;
    byPriority: Record<string, number>;
    cronCount: number;
    baselineReadyCount: number;
  };
  sentinels: Array<{
    id: string;
    name: string;
    category: string;
    priority: string;
    mode: string;
    cron: string | null;
    version: string;
    confidenceModel: string;
    baselineReady: boolean;
    totalRuns: number;
    avgFindingCount: string;
    lastRunAt: string | null;
  }>;
}

export function getSentinelHealthReport(): SentinelHealthReport {
  const registry = getSentinelRegistry();
  const baselineStore = getBaselineStore();
  const allSentinels = registry.list();
  const baselineStats = baselineStore.getAllStats();

  const sentinels = allSentinels.map(s => {
    const baseline = baselineStats.find(b => b.sentinelId === s.config.id);
    return {
      id: s.config.id,
      name: s.config.name,
      category: s.config.category,
      priority: s.config.priority,
      mode: s.config.mode,
      cron: s.config.cron || null,
      version: s.config.version,
      confidenceModel: s.config.confidenceModel,
      baselineReady: baseline?.baselineReady ?? false,
      totalRuns: baseline?.totalRuns ?? 0,
      avgFindingCount: baseline ? baseline.avgFindingCount.toFixed(1) : 'N/A',
      lastRunAt: baseline?.lastRunAt ?? null,
    };
  });

  const summary = {
    total: sentinels.length,
    byCategory: {} as Record<string, number>,
    byPriority: {} as Record<string, number>,
    cronCount: registry.listCronSentinels().length,
    baselineReadyCount: sentinels.filter(s => s.baselineReady).length,
  };

  for (const s of sentinels) {
    summary.byCategory[s.category] = (summary.byCategory[s.category] || 0) + 1;
    summary.byPriority[s.priority] = (summary.byPriority[s.priority] || 0) + 1;
  }

  return { ok: true, summary, sentinels };
}
