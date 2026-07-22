/**
 * routes/auth.ts — JWT 认证路由 (D102: bcrypt登录+注册)
 *
 * POST /api/auth/login    — 登录 (bcrypt密码验证)
 * POST /api/auth/register — 注册 (验证邀请令牌)
 * POST /api/auth/refresh  — 刷新 token
 * POST /api/auth/revoke   — 撤销 token（企业主专属）
 * GET  /api/auth/validate — 验证 token
 *
 * JWT payload 格式不变: { sub: userId, role, orgId }
 */
import { Router, type Request, type Response } from 'express';
import { createLogger } from '@synova/logger';
import { signJwtToken, verifyJwtToken, revokeToken, extractAuthFromRequest } from '../middleware/auth';
import { UserStore, type UserProps } from '../growth/user-store';
import bcrypt from 'bcrypt';

const log = createLogger('auth-routes');
const router = Router();

// ═══ In-memory user store (MVP — D106 migrates to GraphStore) ═══

interface UserRecord {
  userId: string; email: string; passwordHash: string; role: string; orgId: string;
  status: 'active' | 'disabled'; createdAt: string;
}
const users = new Map<string, UserRecord>();
let userIdCounter = 0;

/** D106+D107: UserStore (GraphStore 持久化), 注入后替代内存 Map */
let userStore: UserStore | null = null;

/**
 * 注入 UserStore 实例。
 * 在 server.ts 初始化完成后调用。
 */
export function setUserStore(store: UserStore): void {
  userStore = store;
  log.info('UserStore 已注入 auth 路由 — 用户持久化已启用');
}

// ════════════════════════════════════════════════════════════════
// POST /api/auth/register — 注册新用户
// ════════════════════════════════════════════════════════════════

router.post('/api/auth/register', async (req: Request, res: Response) => {
  try {
    const { email, password, role, orgId } = req.body as { email?: string; password?: string; role?: string; orgId?: string };
    if (!email || !password) return res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', message: 'email 和 password 必填' });
    if (password.length < 6) return res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', message: '密码至少6位' });

    // 检查重复邮箱 (UserStore 优先, 内存 Map 回退)
    if (userStore) {
      const existing = userStore.queryByEmail(email);
      if (existing) return res.status(409).json({ ok: false, code: 'DUPLICATE', message: '邮箱已注册' });
    } else {
      for (const u of users.values()) { if (u.email === email) return res.status(409).json({ ok: false, code: 'DUPLICATE', message: '邮箱已注册' }); }
    }

    const userRole = (role as UserProps['role']) || 'staff' as const;
    const userOrgId = orgId || 'default';
    let finalUserId: string;

    if (userStore) {
      // UserStore.createUser 内部 bcrypt hash + 生成 userId (需要原始 password)
      const result = await userStore.createUser(email, password, userRole, userOrgId);
      finalUserId = result.userId;
    } else {
      finalUserId = `usr-${++userIdCounter}`;
      const passwordHash = await bcrypt.hash(password, 10);
      users.set(finalUserId, { userId: finalUserId, email, passwordHash, role: userRole, orgId: userOrgId, status: 'active', createdAt: new Date().toISOString() });
    }

    const token = signJwtToken({ sub: finalUserId, role: userRole, orgId: userOrgId });
    if (!token) throw new Error('JWT signing failed');

    log.info({ userId: finalUserId, email, store: userStore ? 'graph' : 'memory' }, '用户注册成功');
    return res.status(201).json({ ok: true, token, payload: { userId: finalUserId, role: userRole, orgId: userOrgId } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, 'register 异常');
    return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: msg, degraded: true });
  }
});

// ════════════════════════════════════════════════════════════════
// POST /api/auth/login — 登录 (bcrypt验证)
// ════════════════════════════════════════════════════════════════

router.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) return res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', message: 'email 和 password 必填' });

    let foundUser: UserRecord | null = null;
    // UserStore 优先, 内存 Map 回退
    if (userStore) {
      const stored = userStore.queryByEmail(email);
      if (stored) foundUser = stored as UserRecord;
    } else {
      for (const u of users.values()) { if (u.email === email) { foundUser = u; break; } }
    }
    if (!foundUser) return res.status(401).json({ ok: false, code: 'AUTH_FAILED', message: '邮箱或密码错误' });
    if (foundUser.status !== 'active') return res.status(403).json({ ok: false, code: 'ACCOUNT_DISABLED', message: '账户已停用' });

    const passwordMatch = await bcrypt.compare(password, foundUser.passwordHash);
    if (!passwordMatch) return res.status(401).json({ ok: false, code: 'AUTH_FAILED', message: '邮箱或密码错误' });

    const token = signJwtToken({ sub: foundUser.userId, role: foundUser.role, orgId: foundUser.orgId });
    if (!token) return res.status(500).json({ ok: false, code: 'AUTH_CONFIG_ERROR', message: 'JWT_SECRET 未配置', degraded: true });

    const result = verifyJwtToken(token);
    log.info({ userId: foundUser.userId, email, store: userStore ? 'graph' : 'memory' }, '登录成功');
    return res.json({ ok: true, token, payload: { userId: result.payload?.sub, role: result.payload?.role, orgId: result.payload?.orgId, expiresAt: result.payload?.exp, jti: result.payload?.jti } });
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
    log.error({ err: msg }, 'validate 异常');
    return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: msg, degraded: true });
  }
});

export default router;
