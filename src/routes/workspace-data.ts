/**
 * src/routes/workspace-data.ts — 工作台数据 API 端点 (D74)
 *
 * 提供部门工作台数据的 RESTful API，由 workspace-builder.ts 聚合。
 * 不修改旧 PRD v1.6 routes/workspace.ts（HTML 三栏页面）。
 *
 * 端点:
 *   GET    /api/workspace/:deptId              — 部门工作台全量数据
 *   GET    /api/workspace/:deptId/goals        — 部门活跃 Goal 列表
 *   GET    /api/workspace/:deptId/alerts       — 部门告警（受免打扰过滤）
 *   GET    /api/workspace/:deptId/next-action  — 推荐下一步行动
 *   PUT    /api/workspace/alerts/:id/dismiss   — 消除告警
 *
 * 每个端点返回 { ok: boolean, data?: ..., degraded?: boolean, error?: string }
 *
 * 铁律 24+31: 每个 catch 有 log.warn + degraded 信号
 */
import { Router, type Request, type Response } from 'express';
import { createLogger } from '@synova/logger';
import { buildDepartmentWorkspace } from '../growth/workspace-builder';
import type { WorkspaceBuilderDeps } from '../growth/workspace-builder';

const log = createLogger('routes/workspace-data');
const router = Router();

// 内存告警消除记录（D77 应迁移到持久化存储）
const dismissedAlerts = new Map<string, { dismissedAt: string }>();

/**
 * 构建默认的 WorkspaceBuilderDeps（从 app.locals 取依赖）。
 * 在真实的 app 环境中，需要 GraphStore 等依赖。
 */
function getDefaultDeps(_req: Request): WorkspaceBuilderDeps {
  return {
    graphStore: {
      queryNodes: () => [],
    },
    // 默认不挂载额外查询 — 由调用方配置
  };
}

// ═══ GET /api/workspace/:deptId — 全量数据 ═══

router.get('/api/workspace/:deptId', (req: Request, res: Response) => {
  try {
    const deptId = String(req.params.deptId);
    const deps = getDefaultDeps(req);
    const workspace = buildDepartmentWorkspace(deptId, deps);

    const statusCode = workspace.degraded ? 200 : 200;
    res.status(statusCode).json({
      ok: true,
      data: workspace,
      degraded: workspace.degraded,
      degradedModules: workspace.degradedModules.length > 0 ? workspace.degradedModules : undefined,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg, deptId: req.params.deptId }, '工作台数据聚合失败');
    res.status(500).json({ ok: false, error: msg, degraded: true });
  }
});

// ═══ GET /api/workspace/:deptId/goals — 活跃 Goal 列表 ═══

router.get('/api/workspace/:deptId/goals', (req: Request, res: Response) => {
  try {
    const deptId = String(req.params.deptId);
    const deps = getDefaultDeps(req);
    const workspace = buildDepartmentWorkspace(deptId, deps);

    res.json({
      ok: true,
      data: workspace.activeGoals,
      count: workspace.activeGoals.length,
      degraded: workspace.degraded,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg, deptId: req.params.deptId }, 'Goal 列表加载失败');
    res.status(500).json({ ok: false, error: msg, degraded: true });
  }
});

// ═══ GET /api/workspace/:deptId/alerts — 告警列表（受 DND 过滤） ═══

router.get('/api/workspace/:deptId/alerts', (req: Request, res: Response) => {
  try {
    const deptId = String(req.params.deptId);
    const deps = getDefaultDeps(req);
    const workspace = buildDepartmentWorkspace(deptId, deps);

    // 合并消除状态
    const alerts = workspace.recentAlerts.map((a) => ({
      ...a,
      dismissed: dismissedAlerts.has(a.alertId) ? true : a.dismissed,
      dismissedAt: dismissedAlerts.get(a.alertId)?.dismissedAt ?? a.dismissedAt,
    }));

    res.json({
      ok: true,
      data: alerts,
      count: alerts.length,
      degraded: workspace.degraded,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg, deptId: req.params.deptId }, '告警列表加载失败');
    res.status(500).json({ ok: false, error: msg, degraded: true });
  }
});

// ═══ GET /api/workspace/:deptId/next-action — 推荐下一步行动 ═══

router.get('/api/workspace/:deptId/next-action', (req: Request, res: Response) => {
  try {
    const deptId = String(req.params.deptId);
    const deps = getDefaultDeps(req);
    const workspace = buildDepartmentWorkspace(deptId, deps);

    res.json({
      ok: true,
      data: workspace.nextAction,
      degraded: workspace.degraded,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg, deptId: req.params.deptId }, 'NextAction 加载失败');
    res.status(500).json({ ok: false, error: msg, degraded: true });
  }
});

// ═══ PUT /api/workspace/alerts/:id/dismiss — 消除告警 ═══

router.put('/api/workspace/alerts/:id/dismiss', (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    dismissedAlerts.set(id, { dismissedAt: new Date().toISOString() });

    log.info({ alertId: id }, '告警已消除');
    res.json({
      ok: true,
      data: {
        alertId: id,
        dismissed: true,
        dismissedAt: dismissedAlerts.get(id)!.dismissedAt,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg, alertId: req.params.id }, '告警消除失败');
    res.status(500).json({ ok: false, error: msg, degraded: true });
  }
});

export default router;
