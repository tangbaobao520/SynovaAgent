/**
 * routes/data-lifecycle.ts — D40 数据生命周期 API (GDPR 可携带权+被遗忘权)
 *
 * POST /api/data/export          — 导出租户全部数据
 * POST /api/data/purge           — 发起数据清除（四阶段）
 * GET  /api/data/purge/:id/status — 查询清除进度
 *
 * 铁律 39: L1 路由层 → L3 洞察层 (data-lifecycle-service)
 * 铁律 24: catch + log + degraded
 * 铁律 38: 零 as any
 */
import { Router, type Request, type Response } from 'express';
import { createLogger } from '@synova/logger';
import { StandardOperations } from '../security/policy-engine';
import { checkPolicy, executeExport, executePurge, queryPurgeStatus } from '../agent/data-lifecycle-service';

const log = createLogger('routes/data-lifecycle');
const router = Router();

/** 从 app.locals 提取 GraphStore（运行时注入，无 L4 静态导入） */
function getGraphStore(req: Request): unknown {
  const gs = req.app.locals?.graphStore;
  if (!gs || typeof (gs as Record<string, unknown>).queryNodes !== 'function') {
    throw new Error('GraphStore 不可用');
  }
  return gs;
}

// ═══ POST /api/data/export ═══

router.post('/api/data/export', async (req: Request, res: Response) => {
  const { tenantId, role = 'boss' } = req.body as { tenantId?: string; role?: string };

  if (!tenantId) {
    return res.status(400).json({ ok: false, error: 'tenantId 必填' });
  }

  try {
    const denyReason = checkPolicy(role, StandardOperations.DATA_EXPORT);
    if (denyReason) {
      log.warn({ tenantId, role, denyReason }, '数据导出权限拒绝');
      return res.status(403).json({ ok: false, error: denyReason });
    }

    const graphStore = getGraphStore(req);
    const result = await executeExport(graphStore, tenantId);

    return res.json({ ok: true, ...result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ err: msg, tenantId }, '数据导出失败');
    return res.status(500).json({ ok: false, error: msg });
  }
});

// ═══ POST /api/data/purge ═══

router.post('/api/data/purge', async (req: Request, res: Response) => {
  const { tenantId, role = 'boss', immediate = false } = req.body as {
    tenantId?: string; role?: string; immediate?: boolean;
  };

  if (!tenantId) {
    return res.status(400).json({ ok: false, error: 'tenantId 必填' });
  }

  try {
    const denyReason = checkPolicy(role, StandardOperations.DATA_DELETE);
    if (denyReason) {
      log.warn({ tenantId, role, denyReason }, '数据删除权限拒绝');
      return res.status(403).json({ ok: false, error: denyReason });
    }

    const graphStore = getGraphStore(req);
    const result = await executePurge(graphStore, tenantId, immediate);

    return res.json({ ok: true, job: result.job, message: result.message });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ err: msg, tenantId }, '数据清除发起失败');
    return res.status(500).json({ ok: false, error: msg });
  }
});

// ═══ GET /api/data/purge/:id/status ═══

router.get('/api/data/purge/:id/status', async (req: Request, res: Response) => {
  const purgeIdParam = req.params.id;
  const purgeId = Array.isArray(purgeIdParam) ? purgeIdParam[0] : purgeIdParam;

  if (!purgeId) {
    return res.status(400).json({ ok: false, error: 'purgeId 必填' });
  }

  try {
    const graphStore = getGraphStore(req);
    const job = queryPurgeStatus(graphStore, purgeId);

    if (!job) {
      return res.status(404).json({ ok: false, error: '清除任务不存在' });
    }

    return res.json({ ok: true, job });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ err: msg, purgeId }, '查询清除状态失败');
    return res.status(500).json({ ok: false, error: msg });
  }
});

export default router;
