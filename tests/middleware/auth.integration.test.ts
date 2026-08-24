/**
 * tests/middleware/auth.integration.test.ts — JWT 认证集成测试 (Phase 0.1)
 *
 * 测试完整的 JWT + RBAC 中间件链路，不依赖 createServer() 全部初始化。
 * 铁律 12: 集成测试 cover 真实路由，不 mock 管线。
 *
 * D481: 对齐 D102/D479 确立的 login 契约——email/phone/wechatId + password bcrypt
 * (src/routes/auth.ts L114-146)。用户前置经真实 POST /api/auth/register 建立（唯一 email
 * 防 UserStore 分支 409 DUPLICATE；测试环境 getDatabase() 未初始化 → 内存 Map 降级，零 DB 副作用）。
 * 注: /api/auth/register 不在 jwtAuthMiddleware 白名单 (src/middleware/auth.ts L83-99)，
 * 与生产 server.ts 同构的挂载下需已认证身份方可到达——helper 用真实 signJwtToken 签发
 * bootstrap token 过认证层，注册路由逻辑（校验/bcrypt 哈希/去重/token 签发）100% 真实执行。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import type { Server } from 'http';

const TEST_SECRET = 'synova-demo-secret-for-testing-2026';
const TEST_PASSWORD = 'test-pass-123'; // register 契约: password ≥ 6 位 (src/routes/auth.ts L74)
// 设置测试环境
process.env.JWT_SECRET = TEST_SECRET;
process.env.DEV_MODE = 'false';

import { jwtAuthMiddleware, signJwtToken } from '../../src/middleware/auth';
import authRoutes from '../../src/routes/auth';
import { rbacMiddleware, canModifyWorkspace } from '../../src/middleware/rbac';

// ════════════════════════════════════════════════════════════════
// 测试服务
// ════════════════════════════════════════════════════════════════

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());

  // Phase 0.1: JWT 认证中间件
  app.use(jwtAuthMiddleware);

  // Phase 0.1: Auth 路由
  app.use(authRoutes);

  // RBAC 权限中间件
  app.use(rbacMiddleware);

  // 受保护端点: 工作区列表（读）
  app.get('/api/workspaces', (_req, res) => {
    const ctx = (_req as any).auth;
    res.json({ ok: true, workspaces: [{ id: 'ws-1', title: 'Test Workspace', visibility: 'global' }], auth: { userId: ctx?.sub, role: ctx?.role } });
  });

  // 受保护端点: 删除工作区（写）
  app.delete('/api/workspaces/:id', (req, res) => {
    const ctx = { role: (req as any).auth?.role, userId: (req as any).auth?.sub };
    if (!canModifyWorkspace(ctx, { department: 'default' })) {
      return res.status(403).json({ ok: false, code: 'FORBIDDEN', message: 'GA 不可删除工作区' });
    }
    res.json({ ok: true, deleted: req.params.id });
  });

  return new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address();
      baseUrl = `http://localhost:${typeof addr === 'object' ? addr?.port : 3099}`;
      resolve();
    });
  });
});

// ════════════════════════════════════════════════════════════════
// D481: 注册 + 登录 helper（新契约用户前置）
// ════════════════════════════════════════════════════════════════

/**
 * 真实注册 + 真实登录，返回可用 JWT 与注册响应的 userId（不硬编码）。
 *
 * 契约（铁律 47）:
 * - 输入: role（写入注册请求，透传进 JWT）、tag（保证 email 唯一，防 UserStore 分支 409）
 * - 输出: { token: login 签发的 JWT, userId: 注册响应 payload.userId }
 * - 降级: register/login 任一步非预期状态码 → expect 直接 fail 该用例（fixture 失败 = 用例失败，不静默）
 *
 * register 请求携带真实 signJwtToken 签发的 bootstrap token: /api/auth/register
 * 不在 jwtAuthMiddleware 白名单（src/middleware/auth.ts L83-99），生产同构挂载下
 * 需已认证身份方可到达。中间件真实验证该 token，注册路由逻辑 100% 真实执行（铁律 12）。
 */
async function registerAndLogin(role: string, tag: string): Promise<{ token: string; userId: string }> {
  const email = `${tag}-${Date.now()}@test.local`;

  // ① 注册（唯一 email + password + role + orgId → 201 + payload.userId）
  const bootstrapToken = signJwtToken({ sub: 'test-bootstrap', role: 'admin', orgId: 'acme-corp' });
  const reg = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bootstrapToken}` },
    body: JSON.stringify({ email, password: TEST_PASSWORD, role, orgId: 'acme-corp' }),
  });
  expect(reg.status).toBe(201);
  const regBody = await reg.json() as { ok: boolean; payload: { userId: string; role: string; orgId: string } };
  expect(regBody.ok).toBe(true);
  expect(regBody.payload.role).toBe(role);
  const { userId } = regBody.payload;

  // ② 登录（email + password bcrypt 契约 → 200 + JWT）
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: TEST_PASSWORD }),
  });
  expect(login.status).toBe(200);
  const loginBody = await login.json() as { ok: boolean; token: string; payload: { userId: string } };
  expect(loginBody.ok).toBe(true);
  expect(loginBody.payload.userId).toBe(userId);

  return { token: loginBody.token, userId };
}

// ════════════════════════════════════════════════════════════════
// Auth 流程
// ════════════════════════════════════════════════════════════════

describe('JWT Auth Flow', () => {
  it('POST /api/auth/login → 返回 JWT token', async () => {
    const { token, userId } = await registerAndLogin('ga', 'login200');
    expect(token).toBeTruthy();
    // JWT 结构: header.payload.signature；payload 携带 { sub: userId, role, orgId }（src/middleware/auth.ts L25-32）
    const parts = token.split('.');
    expect(parts).toHaveLength(3);
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { sub: string; role: string; orgId: string };
    expect(payload.sub).toBe(userId);
    expect(payload.role).toBe('ga');
    expect(payload.orgId).toBe('acme-corp');
  });

  it('GET /api/auth/validate with valid token → 200', async () => {
    const { token, userId } = await registerAndLogin('manager', 'validate');

    // Validate
    const res = await fetch(`${baseUrl}/api/auth/validate`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; payload: { role: string; userId: string } };
    expect(body.ok).toBe(true);
    expect(body.payload.role).toBe('manager');
    expect(body.payload.userId).toBe(userId);
  });
});

// ════════════════════════════════════════════════════════════════
// GA 角色权限
// ════════════════════════════════════════════════════════════════

describe('GA Role Permissions', () => {
  it('GA 可读取工作区列表 → 200', async () => {
    const { token } = await registerAndLogin('ga', 'ga-reader');
    const res = await fetch(`${baseUrl}/api/workspaces`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; auth: { role: string } };
    expect(body.ok).toBe(true);
    expect(body.auth.role).toBe('ga');
  });

  it('GA 不可删除工作区 → 403', async () => {
    const { token } = await registerAndLogin('ga', 'ga-deleter');
    const res = await fetch(`${baseUrl}/api/workspaces/test-123`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
    const body = await res.json() as { code: string };
    expect(body.code).toBe('FORBIDDEN');
  });

  it('Admin 可删除工作区 → 200', async () => {
    const { token } = await registerAndLogin('admin', 'admin-deleter');
    const res = await fetch(`${baseUrl}/api/workspaces/test-123`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { deleted: string };
    expect(body.deleted).toBe('test-123');
  });
});

// ════════════════════════════════════════════════════════════════
// 认证失败场景
// ════════════════════════════════════════════════════════════════

describe('Auth Failure Modes', () => {
  it('无 token → 401', async () => {
    const res = await fetch(`${baseUrl}/api/workspaces`);
    expect(res.status).toBe(401);
    const body = await res.json() as any;
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('无效 token → 401', async () => {
    const res = await fetch(`${baseUrl}/api/workspaces`, {
      headers: { Authorization: 'Bearer invalid-token-here' },
    });
    expect(res.status).toBe(401);
  });

  it('过期 token → 401', async () => {
    // 构造过期 token
    const { createHmac } = await import('crypto');
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const expiredPayload = Buffer.from(JSON.stringify({
      sub: 'expired', role: 'ga', orgId: 'acme-corp',
      iat: Math.floor(Date.now() / 1000) - 7200,
      exp: Math.floor(Date.now() / 1000) - 3600,
      jti: 'expired-integration-test',
    })).toString('base64url');

    const sig = createHmac('sha256', TEST_SECRET).update(`${header}.${expiredPayload}`).digest('base64url');
    const expiredToken = `${header}.${expiredPayload}.${sig}`;

    const res = await fetch(`${baseUrl}/api/workspaces`, {
      headers: { Authorization: `Bearer ${expiredToken}` },
    });
    expect(res.status).toBe(401);
  });
});

// ════════════════════════════════════════════════════════════════
// Token 刷新 & 撤销
// ════════════════════════════════════════════════════════════════

describe('Token Refresh & Revoke', () => {
  it('POST /api/auth/refresh → 返回新 token', async () => {
    const { token: oldToken } = await registerAndLogin('admin', 'refresh');

    const res = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${oldToken}`,
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; token: string };
    expect(body.ok).toBe(true);
    expect(body.token).toBeTruthy();
    expect(body.token).not.toBe(oldToken);
  });

  it('POST /api/auth/revoke → token 撤销后不可用', async () => {
    // GA 用户登录（被撤销方）
    const { token: gaToken } = await registerAndLogin('ga', 'revoke-ga');

    // Admin（企业主）登录后执行撤销（revoke 路由契约: 仅 admin/manager 可撤销，src/routes/auth.ts L212-220）
    const { token: adminToken } = await registerAndLogin('admin', 'revoke-admin');

    // Revoke GA token
    const revokeRes = await fetch(`${baseUrl}/api/auth/revoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ token: gaToken }),
    });
    expect(revokeRes.status).toBe(200);

    // GA token should now be invalid
    const accessRes = await fetch(`${baseUrl}/api/workspaces`, {
      headers: { Authorization: `Bearer ${gaToken}` },
    });
    expect(accessRes.status).toBe(401);
  });
});
