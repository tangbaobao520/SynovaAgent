/**
 * routes/audit.ts — 审计日志 API (Phase 0.3, Desktop 实施方案)
 *
 * 仅供 enterprise owner/admin 访问。
 * GA 角色调用返回 403 Forbidden。
 *
 * GET /api/audit          — 查询审计日志
 * GET /api/audit/ga/:gaId — 指定 GA 操作历史
 */
import { Router, type Request, type Response } from 'express';
import { createLogger } from '@synova/logger';
import { AuditService } from '../services/audit-service';
import { extractAuthFromRequest } from '../middleware/auth';

const log = createLogger('routes/audit');
const router = Router();

// ════════════════════════════════════════════════════════════════
// 中间件: 仅 admin/owner 可访问审计日志
// ════════════════════════════════════════════════════════════════

function requireAdminOrOwner(req: Request, res: Response): boolean {
  const authCtx = extractAuthFromRequest(req);
  if (!authCtx) {
    res.status(401).json({ ok: false, code: 'UNAUTHORIZED', message: '未认证' });
    return false;
  }
  if (authCtx.role !== 'admin') {
    res.status(403).json({ ok: false, code: 'FORBIDDEN', message: '仅企业主/管理员可查看审计日志' });
    return false;
  }
  return true;
}

// ════════════════════════════════════════════════════════════════
// GET /api/audit — 查询审计日志
// ════════════════════════════════════════════════════════════════

router.get('/api/audit', (req: Request, res: Response) => {
  try {
    if (!requireAdminOrOwner(req, res)) return;

    const authCtx = extractAuthFromRequest(req)!;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    const orgId: string = typeof req.query.orgId === "string" ? req.query.orgId : authCtx.orgId || "default";
    const action = req.query.action as string | undefined;
    const actorId = req.query.actorId as string | undefined;
    const targetType = req.query.targetType as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;

    const entries = AuditService.query(orgId, { action, actorId, targetType, limit });

    res.json({
      ok: true,
      entries,
      total: entries.length,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, '查询审计日志异常');
    res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: msg, degraded: true });
  }
});

// ════════════════════════════════════════════════════════════════
// GET /api/audit/ga/:gaId — 指定 GA 操作历史
// ════════════════════════════════════════════════════════════════

router.get('/api/audit/ga/:gaId', (req: Request, res: Response) => {
  try {
    if (!requireAdminOrOwner(req, res)) return;

    const authCtx = extractAuthFromRequest(req)!;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    const orgId: string = typeof req.query.orgId === "string" ? req.query.orgId : authCtx.orgId || "default";
    const { gaId } = req.params;

    const entries = AuditService.getGAHistory(orgId as string, gaId as string);

    res.json({
      ok: true,
      gaId,
      entries,
      total: entries.length,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, '查询 GA 操作历史异常');
    res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: msg, degraded: true });
  }
});

export default router;
