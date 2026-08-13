/**
 * routes/overflow.ts — 溢出仪表盘 API 路由
 *
 * D90: 3 个端点:
 *   GET    /api/overflow/dashboard/:enterpriseId  — 溢出仪表盘
 *   POST   /api/overflow/simulate                  — 投资模拟
 *   GET    /api/overflow/snapshots/:cycleId        — 循环快照
 */
import { Router } from 'express';
import { createLogger } from '@synova/logger';
import { cycleRegistry } from '../cycles/cycle-registry';
import { generateOverflowDashboard } from '../cycles/overflow-dashboard';
import { simulateInvestment } from '../cycles/investment-advisor';
import { getCycleSnapshots, getLatestSnapshot } from '../cycles/overflow-graph-bridge';

const log = createLogger('routes/overflow');
const router = Router();

// Mock GraphStore for API (in production, injected via DI)
let graphStore: import('../l4/graph-bridge').GraphStore | null = null;

export function setOverflowGraphStore(store: import('../l4/graph-bridge').GraphStore): void {
  graphStore = store;
  log.info('Overflow GraphStore 已注入');
}

/**
 * GET /api/overflow/dashboard/:enterpriseId
 * 返回组织溢出仪表盘。
 */
router.get('/api/overflow/dashboard/:enterpriseId', (req, res) => {
  try {
    if (!graphStore) {
      res.status(503).json({ error: 'GraphStore 未就绪', degraded: true });
      return;
    }
    const dashboard = generateOverflowDashboard(req.params.enterpriseId, cycleRegistry, graphStore);
    res.json(dashboard);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, '获取溢出仪表盘失败');
    res.status(500).json({ error: '生成仪表盘失败', detail: msg, degraded: true });
  }
});

/**
 * POST /api/overflow/simulate
 * 投资模拟。
 * Body: { cycleId, amount, direction }
 */
router.post('/api/overflow/simulate', (req, res) => {
  try {
    if (!graphStore) {
      res.status(503).json({ error: 'GraphStore 未就绪', degraded: true });
      return;
    }
    const { cycleId, amount, direction } = req.body || {};
    if (!cycleId) {
      res.status(400).json({ error: '缺少 cycleId' });
      return;
    }
    const cycle = cycleRegistry.get(cycleId);
    if (!cycle) {
      res.status(404).json({ error: `循环 ${cycleId} 未注册` });
      return;
    }
    const allCycles = cycleRegistry.list();
    const result = simulateInvestment(cycleId, amount ?? 0, direction ?? '', cycle, graphStore, allCycles);
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, '投资模拟失败');
    res.status(500).json({ error: '模拟失败', detail: msg, degraded: true });
  }
});

/**
 * GET /api/overflow/snapshots/:cycleId
 * 返回指定循环的溢出快照历史。
 * Query: ?enterpriseId=xxx&limit=12
 */
router.get('/api/overflow/snapshots/:cycleId', (req, res) => {
  try {
    if (!graphStore) {
      res.status(503).json({ error: 'GraphStore 未就绪', degraded: true });
      return;
    }
    const enterpriseId = (req.query.enterpriseId as string) || 'default';
    const limit = parseInt(req.query.limit as string, 10) || 12;
    const snapshots = getCycleSnapshots(enterpriseId, req.params.cycleId, graphStore, { limit });
    const latest = getLatestSnapshot(enterpriseId, req.params.cycleId, graphStore);
    res.json({ cycleId: req.params.cycleId, snapshots, latest, total: snapshots.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, '获取快照失败');
    res.status(500).json({ error: '获取快照失败', detail: msg, degraded: true });
  }
});

export default router;
