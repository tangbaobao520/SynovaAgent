/**
 * routes/auth.ts — JWT 认证路由 (Phase 0.1, Desktop 实施方案)
 *
 * POST /api/auth/login    — 登录获取 JWT（演示版：按 role/orgId 签发）
 * POST /api/auth/refresh  — 刷新 token
 * POST /api/auth/revoke   — 撤销 token（企业主专属）
 *
 * 设计原则:
 * - 演示版 login 不校验密码，由前端或 API 客户端按需指定角色
 * - 生产版 v2 将接入 OAuth/OIDC + 企业主审批
 * - 所有错误返回统一 JSON 格式 { ok: false, code, message }
 */
import { Router, type Request, type Response } from 'express';
import { createLogger } from '@synova/logger';
import { signJwtToken, verifyJwtToken, revokeToken, extractAuthFromRequest } from '../middleware/auth';
import { canAccessWorkspace, canModifyWorkspace } from '../middleware/rbac';

const log = createLogger('auth-routes');
const router = Router();

// ════════════════════════════════════════════════════════════════
// POST /api/auth/login — 登录获取 JWT
// ════════════════════════════════════════════════════════════════

/**
 * 演示版登录。生产版 v2 将接入企业认证系统。
 *
 * Body: {
 *   userId: string;    // 用户标识 (demo: 任意字符串)
 *   role: string;      // admin | manager | liaison | staff | ga
 *   orgId?: string;    // 组织 ID (默认: 'default')
 * }
 */
router.post('/api/auth/login', (req: Request, res: Response) => {
  try {
    const { userId, role, orgId } = req.body as {
      userId?: string;
      role?: string;
      orgId?: string;
    };

    // 参数校验
    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
      return res.status(400).json({
        ok: false,
        code: 'VALIDATION_ERROR',
        message: 'userId 必填',
      });
    }

    if (!role || typeof role !== 'string') {
      return res.status(400).json({
        ok: false,
        code: 'VALIDATION_ERROR',
        message: 'role 必填 (admin | manager | liaison | staff | ga)',
      });
    }

    // 验证 role 合法性
    const validRoles = ['admin', 'manager', 'liaison', 'staff', 'ga'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        ok: false,
        code: 'VALIDATION_ERROR',
        message: `无效角色: ${role}。有效值: ${validRoles.join(', ')}`,
      });
    }

    const targetOrgId = orgId || 'default';

    // 签发 JWT
    const token = signJwtToken({
      sub: userId.trim(),
      role,
      orgId: targetOrgId,
    });

    if (!token) {
      log.warn('JWT_SECRET 未配置，无法签发 token');
      return res.status(500).json({
        ok: false,
        code: 'AUTH_CONFIG_ERROR',
        message: '认证服务未配置（JWT_SECRET 未设置）',
        degraded: true,
      });
    }

    // 解析 payload 返回给客户端
    const result = verifyJwtToken(token);

    log.info({ userId, role, orgId: targetOrgId }, 'Token 已签发');

    return res.json({
      ok: true,
      token,
      payload: {
        userId: result.payload?.sub,
        role: result.payload?.role,
        orgId: result.payload?.orgId,
        expiresAt: result.payload?.exp,
        jti: result.payload?.jti,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, 'login 异常');
    return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: msg, degraded: true });
  }
});

// ════════════════════════════════════════════════════════════════
// POST /api/auth/refresh — 刷新 JWT
// ════════════════════════════════════════════════════════════════

router.post('/api/auth/refresh', (req: Request, res: Response) => {
  try {
    const authHeader = req.headers['authorization'] as string | undefined;
    const bodyToken = req.body?.token as string | undefined;
    const token = bodyToken || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined);

    if (!token) {
      return res.status(401).json({
        ok: false,
        code: 'UNAUTHORIZED',
        message: '需要提供 token（Authorization header 或 body.token）',
      });
    }

    // 验证现有 token
    const result = verifyJwtToken(token);
    if (!result.payload) {
      return res.status(401).json({
        ok: false,
        code: 'UNAUTHORIZED',
        message: result.error || 'Token 无效',
      });
    }

    // 签发新 token（保留原有信息）
    const newToken = signJwtToken({
      sub: result.payload.sub,
      role: result.payload.role,
      orgId: result.payload.orgId,
    });

    if (!newToken) {
      return res.status(500).json({
        ok: false,
        code: 'AUTH_CONFIG_ERROR',
        message: '认证服务未配置（JWT_SECRET 未设置）',
        degraded: true,
      });
    }

    log.info({ userId: result.payload.sub, role: result.payload.role }, 'Token 已刷新');

    return res.json({
      ok: true,
      token: newToken,
      previousToken: token, // 客户端可自行撤销旧 token
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, 'refresh 异常');
    return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: msg, degraded: true });
  }
});

// ════════════════════════════════════════════════════════════════
// POST /api/auth/revoke — 撤销 JWT（企业主专属）
// ════════════════════════════════════════════════════════════════

router.post('/api/auth/revoke', (req: Request, res: Response) => {
  try {
    // 检查调用者身份：仅 admin/owner 可撤销
    const authCtx = extractAuthFromRequest(req);
    if (!authCtx || (authCtx.role !== 'admin' && authCtx.role !== 'manager')) {
      return res.status(403).json({
        ok: false,
        code: 'FORBIDDEN',
        message: '仅企业主或管理员可撤销 token',
      });
    }

    const { token } = req.body as { token?: string };
    if (!token) {
      return res.status(400).json({
        ok: false,
        code: 'VALIDATION_ERROR',
        message: 'body.token 必填',
      });
    }

    const revoked = revokeToken(token);
    if (!revoked) {
      return res.status(400).json({
        ok: false,
        code: 'INVALID_TOKEN',
        message: '无法撤销：token 无效或已过期',
      });
    }

    log.info({ revokedBy: authCtx.userId }, 'Token 已撤销');
    return res.json({ ok: true, message: 'Token 已撤销' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, 'revoke 异常');
    return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: msg, degraded: true });
  }
});

// ════════════════════════════════════════════════════════════════
// GET /api/auth/validate — 验证当前 token 是否有效
// ════════════════════════════════════════════════════════════════

router.get('/api/auth/validate', (req: Request, res: Response) => {
  try {
    const authHeader = req.headers['authorization'] as string | undefined;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;

    if (!token) {
      return res.status(401).json({
        ok: false,
        code: 'UNAUTHORIZED',
        message: '缺少 token',
      });
    }

    const result = verifyJwtToken(token);
    if (!result.payload) {
      return res.status(401).json({
        ok: false,
        code: 'UNAUTHORIZED',
        message: result.error || 'Token 无效',
        error: result.error,
      });
    }

    return res.json({
      ok: true,
      payload: {
        userId: result.payload.sub,
        role: result.payload.role,
        orgId: result.payload.orgId,
        issuedAt: result.payload.iat,
        expiresAt: result.payload.exp,
        jti: result.payload.jti,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: msg, degraded: true });
  }
});

export default router;
