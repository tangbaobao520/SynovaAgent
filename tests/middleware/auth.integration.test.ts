/**
 * tests/middleware/auth.integration.test.ts — JWT 认证集成测试 (Phase 0.1)
 *
 * 测试完整的 JWT + RBAC 中间件链路，不依赖 createServer() 全部初始化。
 * 铁律 12: 集成测试 cover 真实路由，不 mock 管线。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import type { Server } from 'http';

const TEST_SECRET = 'synova-demo-secret-for-testing-2026';
// 设置测试环境
process.env.JWT_SECRET = TEST_SECRET;
process.env.DEV_MODE = 'false';

import { jwtAuthMiddleware } from '../../src/middleware/auth';
import authRoutes from '../../src/routes/auth';
import { rbacMiddleware, canAccessWorkspace, canModifyWorkspace } from '../../src/middleware/rbac';

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
// Auth 流程
// ════════════════════════════════════════════════════════════════

describe('JWT Auth Flow', () => {
  it('POST /api/auth/login → 返回 JWT token', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'ga_001', role: 'ga', orgId: 'acme-corp' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.ok).toBe(true);
    expect(body.token).toBeTruthy();
    expect(body.token.split('.')).toHaveLength(3);
    expect(body.payload.role).toBe('ga');
    expect(body.payload.userId).toBe('ga_001');
  });

  it('GET /api/auth/validate with valid token → 200', async () => {
    // Login first
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'val_user', role: 'manager', orgId: 'test' }),
    });
    const { token } = await login.json() as any;

    // Validate
    const res = await fetch(`${baseUrl}/api/auth/validate`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.ok).toBe(true);
    expect(body.payload.role).toBe('manager');
    expect(body.payload.userId).toBe('val_user');
  });
});

// ════════════════════════════════════════════════════════════════
// GA 角色权限
// ════════════════════════════════════════════════════════════════

describe('GA Role Permissions', () => {
  async function loginAs(role: string, userId: string): Promise<string> {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, role, orgId: 'acme-corp' }),
    });
    const body = await res.json() as any;
    return body.token;
  }

  it('GA 可读取工作区列表 → 200', async () => {
    const token = await loginAs('ga', 'ga_reader');
    const res = await fetch(`${baseUrl}/api/workspaces`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.ok).toBe(true);
    expect(body.auth.role).toBe('ga');
  });

  it('GA 不可删除工作区 → 403', async () => {
    const token = await loginAs('ga', 'ga_deleter');
    const res = await fetch(`${baseUrl}/api/workspaces/test-123`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
    const body = await res.json() as any;
    expect(body.code).toBe('FORBIDDEN');
  });

  it('Admin 可删除工作区 → 200', async () => {
    const token = await loginAs('admin', 'admin_user');
    const res = await fetch(`${baseUrl}/api/workspaces/test-123`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
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
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'refresh_user', role: 'admin', orgId: 'test' }),
    });
    const { token: oldToken } = await login.json() as any;

    const res = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${oldToken}`,
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.ok).toBe(true);
    expect(body.token).toBeTruthy();
    expect(body.token).not.toBe(oldToken);
  });

  it('POST /api/auth/revoke → token 撤销后不可用', async () => {
    // Login as GA
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'revoke_me', role: 'ga', orgId: 'test' }),
    });
    const { token: gaToken } = await login.json() as any;

    // Login as admin (owner) to revoke
    const adminLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'owner', role: 'admin', orgId: 'test' }),
    });
    const { token: adminToken } = await adminLogin.json() as any;

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
