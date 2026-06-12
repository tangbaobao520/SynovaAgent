/**
 * routes/sentinel-health.ts — Sentinel 健康检查 API (L1)
 * @state: real
 *
 * GET /api/sentinel/health — 返回所有已注册哨兵的状态 + 基线统计
 */

import { Router, type Request, type Response } from 'express';
import { getSentinelRegistry } from '../sentinel/registry';
import { getBaselineStore } from '../sentinel/baseline-store';
import { createLogger } from '../logger';

const log = createLogger('routes/sentinel-health');
const router = Router();

router.get('/health', (_req: Request, res: Response) => {
  try {
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

    res.json({ ok: true, summary, sentinels });
  } catch (err: any) {
    log.error({ err }, '哨兵健康检查失败');
    res.status(500).json({ ok: false, error: err.message, sentinels: [] });
  }
});

export default router;
