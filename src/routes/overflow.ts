/**
 * routes/overflow.ts — 溢出仪表盘 API 路由
 *
 * D90: 3 个端点:
 *   GET    /api/overflow/dashboard/:enterpriseId  — 溢出仪表盘
 *   POST   /api/overflow/simulate                  — 投资模拟
 *   GET    /api/overflow/snapshots/:cycleId        — 循环快照
 */
import { Router, type Request, type Response } from 'express';
import { createLogger } from '@synova/logger';
import { extractAuthFromRequest } from '../middleware/auth';
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
 * D476 O7 认证守卫: 无认证 → 401 UNAUTHORIZED；auth.orgId 缺失 → 400 ORG_REQUIRED。
 * 返回租户 orgId（null = 已响应拒绝，调用方直接 return）。
 * 不加 role 检查——O7 只要求纳入认证体系，现有前端 dashboard.js 用户为 workspace 角色非 ga/admin（dev doc §3.2 回填）。
 */
function requireAuth(req: Request, res: Response): string | null {
  const auth = extractAuthFromRequest(req);
  if (!auth) { res.status(401).json({ ok: false, code: 'UNAUTHORIZED' }); return null; }
  // D338 fail-closed 中国墙: 缺组织上下文 → 拒绝，绝不回落 'default' 共享命名空间
  if (!auth.orgId) { res.status(400).json({ ok: false, code: 'ORG_REQUIRED', message: '缺少组织上下文' }); return null; }
  return auth.orgId;
}

/**
 * GET /api/overflow/dashboard/:enterpriseId
 * 返回组织溢出仪表盘。
 * D476 O7: 需认证；路径参数 enterpriseId 与认证身份不一致 → 403 FORBIDDEN。
 */
router.get('/api/overflow/dashboard/:enterpriseId', (req, res) => {
  try {
    const orgId = requireAuth(req, res);
    if (!orgId) return;
    // D476: 租户 = 认证身份，路径参数不一致 → 拒绝（跨租户读）
    if (req.params.enterpriseId !== orgId) {
      res.status(403).json({ ok: false, code: 'FORBIDDEN', message: '企业上下文与认证身份不一致' });
      return;
    }
    if (!graphStore) {
      res.status(503).json({ error: 'GraphStore 未就绪', degraded: true });
      return;
    }
    const dashboard = generateOverflowDashboard(orgId, cycleRegistry, graphStore);
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
 * Body: { cycleId, amount, direction, enterpriseId? }
 * D476 O7: 需认证；body 显式 enterpriseId 与认证身份不一致 → 403 FORBIDDEN；
 * 企业作用域一律用 auth.orgId（零回落，原字面 'default' 回退已删）。
 */
router.post('/api/overflow/simulate', (req, res) => {
  try {
    const orgId = requireAuth(req, res);
    if (!orgId) return;
    // D476: 租户 = 认证身份，显式声明不一致 → 拒绝（跨租户写入）
    const bodyEnterpriseId: unknown = req.body?.enterpriseId;
    if (typeof bodyEnterpriseId === 'string' && bodyEnterpriseId !== orgId) {
      res.status(403).json({ ok: false, code: 'FORBIDDEN', message: '企业上下文与认证身份不一致' });
      return;
    }
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
    // D476 缺陷 C 修复: 租户 = 认证身份（auth.orgId 权威），零回落
    const enterpriseId = orgId;
    const result = simulateInvestment(enterpriseId, cycleId, amount ?? 0, direction ?? '', cycle, graphStore, allCycles);
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
 * Query: ?limit=12
 * D476 O7: 需认证；企业作用域一律用 auth.orgId（零回落，原字面 'default' 回退已删）；
 * query 显式 enterpriseId 与认证身份不一致 → 403 FORBIDDEN。
 */
router.get('/api/overflow/snapshots/:cycleId', (req, res) => {
  try {
    const orgId = requireAuth(req, res);
    if (!orgId) return;
    // D476: 租户 = 认证身份，显式声明不一致 → 拒绝（跨租户读）
    const queryEnterpriseId: unknown = req.query.enterpriseId;
    if (typeof queryEnterpriseId === 'string' && queryEnterpriseId !== orgId) {
      res.status(403).json({ ok: false, code: 'FORBIDDEN', message: '企业上下文与认证身份不一致' });
      return;
    }
    if (!graphStore) {
      res.status(503).json({ error: 'GraphStore 未就绪', degraded: true });
      return;
    }
    const limit = parseInt(req.query.limit as string, 10) || 12;
    const snapshots = getCycleSnapshots(orgId, req.params.cycleId, graphStore, { limit });
    const latest = getLatestSnapshot(orgId, req.params.cycleId, graphStore);
    res.json({ cycleId: req.params.cycleId, snapshots, latest, total: snapshots.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, '获取快照失败');
    res.status(500).json({ error: '获取快照失败', detail: msg, degraded: true });
  }
});

export default router;
