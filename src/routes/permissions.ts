/**
 * routes/permissions.ts — 权限管理 API (M2 — 对话变更权限)
 *
 * POST /api/permissions/update   — 修改单条知识访问权限
 * POST /api/permissions/bulk     — 批量修改权限
 * GET  /api/permissions/audit    — 查看权限变更审计日志
 * GET  /api/permissions/stats    — 按领域查看权限分布
 *
 * 铁律 39: L1 交互层，委托 L4 KnowledgeStore 执行。
 * 铁律 31: 降级信号传播 — 所有错误返回 degraded 标记。
 */
import { Router, type Request, type Response } from 'express';
import { KnowledgeStore } from '../l4/knowledge-store';
import { getDatabase } from '../init/engine-context';
import { getCurrentUser } from '../services/request-context';
import { createLogger } from '../logger';

const log = createLogger('routes/permissions');
const router = Router();

function getStore(): KnowledgeStore {
  return new KnowledgeStore(getDatabase());
}

/** 检查当前用户是否为 admin */
function requireAdmin(res: Response): boolean {
  const user = getCurrentUser();
  if (!user || !user.auth.roles.includes('admin')) {
    res.status(403).json({ ok: false, error: '需要管理员权限', code: 'FORBIDDEN' });
    return false;
  }
  return true;
}

/** 从请求中提取操作用户 ID (devMode 默认 admin) */
function getOperatorId(req: Request): string {
  // 优先从 auth middleware 注入的 user 对象获取
  const user = (req as unknown as Record<string, unknown>).user as { userId?: string } | undefined;
  if (user?.userId) return user.userId;
  // fallback: header token 的哈希前缀
  const token = req.headers['authorization']?.replace('Bearer ', '') || 'dev-operator';
  return `operator:${token.slice(0, 12)}`;
}

// ═══ 修改单条权限 ═══

router.post('/api/permissions/update', (req: Request, res: Response) => {
  if (!requireAdmin(res)) return;
  try {
    const { id, accessLevel, accessTeamId, accessSensitivity, reason } = req.body as {
      id?: string; accessLevel?: string; accessTeamId?: string; accessSensitivity?: string; reason?: string;
    };

    if (!id) {
      return res.status(400).json({ ok: false, error: '缺少 id 参数', code: 'VALIDATION_ERROR' });
    }

    const store = getStore();
    const result = store.updateAccess(id, {
      accessLevel: accessLevel as 'public' | 'team' | 'private' | undefined,
      accessTeamId: accessTeamId || null,
      accessSensitivity: accessSensitivity as 'normal' | 'sensitive' | 'restricted' | undefined,
    });

    if (result.ok) {
      // 获取旧值用于审计
      const rows = store.listByDomain(undefined, 5000);
      const entry = rows.find(r => r.id === id);
      store.auditPermissionChange({
        eventType: 'access_change',
        changedBy: getOperatorId(req),
        targetIds: [id],
        oldAccessLevel: entry?.access_level as string | undefined,
        newAccessLevel: accessLevel,
        oldSensitivity: entry?.access_sensitivity as string | undefined,
        newSensitivity: accessSensitivity,
        reason: reason || 'API 调用修改',
      });
    }

    res.json({ ...result, degraded: !result.ok });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, '权限修改失败');
    res.status(500).json({ ok: false, error: msg, code: 'PERMISSION_ERROR', degraded: true });
  }
});

// ═══ 批量修改权限 ═══

router.post('/api/permissions/bulk', (req: Request, res: Response) => {
  if (!requireAdmin(res)) return;
  try {
    const { domain, ids, accessLevel, accessTeamId, accessSensitivity, restrictToTeam, reason } = req.body as {
      domain?: string; ids?: string[]; accessLevel?: string; accessTeamId?: string;
      accessSensitivity?: string; restrictToTeam?: string; reason?: string;
    };

    if (!domain && (!ids || ids.length === 0)) {
      return res.status(400).json({ ok: false, error: '请指定 domain 或 ids', code: 'VALIDATION_ERROR' });
    }

    const store = getStore();
    const result = store.bulkUpdateAccess({
      domain,
      ids,
      accessLevel: accessLevel as 'public' | 'team' | 'private' | undefined,
      accessTeamId: accessTeamId || null,
      accessSensitivity: accessSensitivity as 'normal' | 'sensitive' | 'restricted' | undefined,
      restrictToTeam,
    });

    if (result.updated > 0) {
      store.auditPermissionChange({
        eventType: accessLevel === 'public' ? 'bulk_share' : 'restrict',
        changedBy: getOperatorId(req),
        targetIds: ids || [`domain:${domain}`],
        newAccessLevel: accessLevel,
        newSensitivity: accessSensitivity,
        reason: reason || 'API 批量操作',
      });
    }

    res.json({ ...result, degraded: !result.ok && result.warnings.length > 0 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, '批量权限修改失败');
    res.status(500).json({ ok: false, error: msg, code: 'BULK_PERMISSION_ERROR', degraded: true });
  }
});

// ═══ 查看权限审计日志 ═══

router.get('/api/permissions/audit', (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const changedBy = req.query.user as string | undefined;
    const store = getStore();
    const logEntries = store.getPermissionAuditLog(limit, changedBy);

    res.json({
      ok: true,
      total: logEntries.length,
      entries: logEntries.map(e => ({
        id: e.id,
        eventType: e.event_type,
        changedBy: e.changed_by,
        targetIds: JSON.parse(e.target_ids as string || '[]'),
        oldAccessLevel: e.old_access_level,
        newAccessLevel: e.new_access_level,
        oldTeamId: e.old_team_id,
        newTeamId: e.new_team_id,
        oldSensitivity: e.old_sensitivity,
        newSensitivity: e.new_sensitivity,
        reason: e.reason,
        createdAt: e.created_at,
      })),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, '获取权限审计日志失败');
    res.status(500).json({ ok: false, error: msg, code: 'AUDIT_ERROR', degraded: true });
  }
});

// ═══ 按领域查看权限分布 ═══

router.get('/api/permissions/stats', (_req: Request, res: Response) => {
  try {
    const store = getStore();
    const stats = store.getAccessStatsByDomain();

    // 计算总计
    let totalEntries = 0, totalPublic = 0, totalRestricted = 0;
    for (const d of Object.values(stats)) {
      totalEntries += d.total;
      totalPublic += d.public;
      totalRestricted += d.restricted;
    }

    res.json({
      ok: true,
      totalEntries,
      totalPublic,
      totalRestricted,
      shareRatio: totalEntries > 0 ? Math.round((totalPublic / totalEntries) * 100) : 0,
      byDomain: stats,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, '获取权限统计失败');
    res.status(500).json({ ok: false, error: msg, code: 'STATS_ERROR', degraded: true });
  }
});

export default router;
