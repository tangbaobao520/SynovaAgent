/**
 * tests/middleware/auth.test.ts — JWT 认证中间件单元测试 (Phase 0.1)
 *
 * test-first: 先定义验收标准，再实现。
 * 铁律 33: *.test.ts 命名约定。
 * 铁律 38: as any 零容忍。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createHmac } from 'crypto';
import type { Request, Response } from 'express';

// 测试前设置 JWT_SECRET（模块读取时使用）
const TEST_SECRET = 'test-secret-for-unit-testing-only';

import {
  signJwtToken,
  verifyJwtToken,
  jwtAuthMiddleware,
  revokeToken,
  extractAuthFromRequest,
  clearRevokedTokens,
} from '../../src/middleware/auth';

// ============================================================
// 辅助函数
// ============================================================

function mockReq(headers: Record<string, string> = {}, path = '/api/workspaces'): Partial<Request> {
  const req: Record<string, unknown> & { headers: Record<string, string> } = {
    headers: { ...headers },
    path,
  };
  return req as unknown as Request;
}

function mockRes(): Partial<Response> & { statusCode?: number; body?: unknown } {
  const res: Record<string, unknown> & { statusCode?: number; body?: unknown } = {};
  res.status = (code: number) => {
    res.statusCode = code;
    return res as unknown as Response;
  };
  res.json = (body: unknown) => {
    res.body = body;
    return res as unknown as Response;
  };
  return res as unknown as Response & { statusCode?: number; body?: unknown };
}

function makeExpiredToken(sub: string, role: string, orgId: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const expiredPayload = Buffer.from(JSON.stringify({
    sub, role, orgId,
    iat: Math.floor(Date.now() / 1000) - 7200,
    exp: Math.floor(Date.now() / 1000) - 3600,
    jti: `expired-${sub}-${Date.now()}`,
  })).toString('base64url');
  const signingInput = `${header}.${expiredPayload}`;
  const sig = createHmac('sha256', TEST_SECRET).update(signingInput).digest('base64url');
  return `${signingInput}.${sig}`;
}

// ============================================================
// JWT 签名 & 验证
// ============================================================

describe('signJwtToken / verifyJwtToken', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = TEST_SECRET;
    process.env.DEV_MODE = 'false';
    clearRevokedTokens();
  });

  it('sign + verify 返回有效 payload', () => {
    const payload = { sub: 'user1', role: 'ga', orgId: 'org-1' };
    const token = signJwtToken(payload);
    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');
    expect(token!.split('.')).toHaveLength(3); // header.payload.signature

    const result = verifyJwtToken(token!);
    expect(result.payload).toBeTruthy();
    expect(result.payload!.sub).toBe('user1');
    expect(result.payload!.role).toBe('ga');
    expect(result.payload!.orgId).toBe('org-1');
    expect(result.payload!.iat).toBeGreaterThan(0);
    expect(result.payload!.exp).toBeGreaterThan(result.payload!.iat);
    expect(result.payload!.jti).toBeTruthy();
    expect(result.error).toBeUndefined();
  });

  it('过期 token 返回 error=Token expired', () => {
    const token = makeExpiredToken('user2', 'admin', 'org-1');
    const result = verifyJwtToken(token);
    expect(result.payload).toBeNull();
    expect(result.error).toBe('Token expired');
  });

  it('被篡改的 token 返回 error=Invalid signature', () => {
    const token = signJwtToken({ sub: 'user3', role: 'admin', orgId: 'org-1' });
    expect(token).toBeTruthy();

    // 篡改 payload 部分
    const parts = token!.split('.');
    const tamperedPayload = Buffer.from(JSON.stringify({
      sub: 'hacker', role: 'admin', orgId: 'org-1',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      jti: 'hacked-jti',
    })).toString('base64url');
    const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

    const result = verifyJwtToken(tamperedToken);
    expect(result.payload).toBeNull();
    expect(result.error).toBe('Invalid signature');
  });

  it('畸形 token 格式返回 error=Invalid token format', () => {
    const result = verifyJwtToken('not-a-jwt-token');
    expect(result.payload).toBeNull();
    expect(result.error).toBe('Invalid token format');
  });

  it('空 token 返回 error=Token is empty', () => {
    const result = verifyJwtToken('');
    expect(result.payload).toBeNull();
    expect(result.error).toBe('Token is empty');
  });

  it('每个 token 有唯一 jti', () => {
    const payload = { sub: 'alice', role: 'manager', orgId: 'acme-corp' };
    const token1 = signJwtToken(payload);
    const token2 = signJwtToken(payload);
    expect(token1).toBeTruthy();
    expect(token2).toBeTruthy();

    const r1 = verifyJwtToken(token1!);
    const r2 = verifyJwtToken(token2!);
    expect(r1.payload!.jti).not.toBe(r2.payload!.jti);
  });

  it('缺失必填字段的 token 被拒绝', () => {
    const { createHmac: ch } = require('crypto');
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    // 缺少 sub 字段
    const badPayload = Buffer.from(JSON.stringify({
      role: 'admin', orgId: 'org-1',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      jti: 'no-sub-jti',
    })).toString('base64url');
    const sig = ch('sha256', TEST_SECRET).update(`${header}.${badPayload}`).digest('base64url');
    const badToken = `${header}.${badPayload}.${sig}`;

    const result = verifyJwtToken(badToken);
    expect(result.payload).toBeNull();
    expect(result.error).toContain('Missing required fields');
  });
});

// ============================================================
// Token 撤销
// ============================================================

describe('revokeToken', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = TEST_SECRET;
    clearRevokedTokens();
  });

  it('撤销有效 token → isTokenRevoked 返回 true', () => {
    const token = signJwtToken({ sub: 'ga_user', role: 'ga', orgId: 'org-1' });
    expect(token).toBeTruthy();

    // 撤销前能通过验证
    const before = verifyJwtToken(token!);
    expect(before.error).toBeUndefined();

    // 撤销
    const revoked = revokeToken(token!);
    expect(revoked).toBe(true);

    // 撤销后验证失败
    const after = verifyJwtToken(token!);
    expect(after.payload).toBeNull();
    expect(after.error).toBe('Token revoked');
  });

  it('撤销无效 token → 返回 false', () => {
    const revoked = revokeToken('invalid-token');
    expect(revoked).toBe(false);
  });

  it('撤销后同一用户的新 token 仍可用', () => {
    const token1 = signJwtToken({ sub: 'user', role: 'admin', orgId: 'org-1' });
    expect(token1).toBeTruthy();
    revokeToken(token1!);

    // 新签发 token（不同 jti）应可用
    const token2 = signJwtToken({ sub: 'user', role: 'admin', orgId: 'org-1' });
    expect(token2).toBeTruthy();
    const result2 = verifyJwtToken(token2!);
    expect(result2.payload).toBeTruthy();
  });
});

// ============================================================
// 中间件行为
// ============================================================

describe('jwtAuthMiddleware', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = TEST_SECRET;
    process.env.DEV_MODE = 'false';
    clearRevokedTokens();
  });

  it('whitelisted path /health → pass through', () => {
    const req = { path: '/health', headers: {} } as Request;
    const res = { statusCode: undefined, status() { return this; }, json() { return this; } } as unknown as Response & { statusCode?: number };
    let nextCalled = false;

    jwtAuthMiddleware(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(true);
  });

  it('whitelisted path /api/auth/login → pass through', () => {
    const req = { path: '/api/auth/login', headers: {} } as Request;
    const res = { statusCode: undefined, status() { return this; }, json() { return this; } } as unknown as Response & { statusCode?: number };
    let nextCalled = false;

    jwtAuthMiddleware(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(true);
  });

  it('无 Authorization header → 401', () => {
    const req = { path: '/api/workspaces', headers: {} } as Request;
    const res: Record<string, unknown> & { statusCode?: number; body?: unknown } = {};
    res.status = (code: number) => { res.statusCode = code; return res as unknown as Response; };
    res.json = (body: unknown) => { res.body = body; return res as unknown as Response; };
    let nextCalled = false;

    jwtAuthMiddleware(req as Request, res as unknown as Response, () => { nextCalled = true; });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
    expect((res.body as Record<string, unknown>)?.code).toBe('UNAUTHORIZED');
  });

  it('Authorization header 无 Bearer 前缀 → 401', () => {
    const req = { path: '/api/workspaces', headers: { authorization: 'Basic xxx' } } as Request;
    const res: Record<string, unknown> & { statusCode?: number; body?: unknown } = {};
    res.status = (code: number) => { res.statusCode = code; return res as unknown as Response; };
    res.json = (body: unknown) => { res.body = body; return res as unknown as Response; };
    let nextCalled = false;

    jwtAuthMiddleware(req as Request, res as unknown as Response, () => { nextCalled = true; });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it('有效 JWT → 注入 auth + 调用 next', () => {
    const token = signJwtToken({ sub: 'ga_user', role: 'ga', orgId: 'org-1' });
    expect(token).toBeTruthy();

    const req: Record<string, unknown> & { path: string; headers: Record<string, string>; auth?: unknown } = {
      path: '/api/workspaces',
      headers: { authorization: `Bearer ${token}` },
    };
    const res: Record<string, unknown> & { statusCode?: number } = {};
    res.status = (code: number) => { res.statusCode = code; return res as unknown as Response; };
    res.json = (body: unknown) => { return res as unknown as Response; };
    let nextCalled = false;

    jwtAuthMiddleware(req as unknown as Request, res as unknown as Response, () => { nextCalled = true; });

    expect(nextCalled).toBe(true);
    expect(res.statusCode).toBeUndefined();
    expect(req.auth).toBeTruthy();
    expect((req.auth as Record<string, unknown>)?.role).toBe('ga');
    expect((req.auth as Record<string, unknown>)?.sub).toBe('ga_user');
  });

  it('过期 token → 401', () => {
    const token = makeExpiredToken('old', 'ga', 'org-1');
    const req = { path: '/api/workspaces', headers: { authorization: `Bearer ${token}` } } as Request;
    const res: Record<string, unknown> & { statusCode?: number; body?: unknown } = {};
    res.status = (code: number) => { res.statusCode = code; return res as unknown as Response; };
    res.json = (body: unknown) => { res.body = body; return res as unknown as Response; };
    let nextCalled = false;

    jwtAuthMiddleware(req as Request, res as unknown as Response, () => { nextCalled = true; });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it('撤销的 token → 401', () => {
    const token = signJwtToken({ sub: 'revoked_user', role: 'ga', orgId: 'org-1' });
    expect(token).toBeTruthy();
    revokeToken(token!);

    const req = { path: '/api/workspaces', headers: { authorization: `Bearer ${token}` } } as Request;
    const res: Record<string, unknown> & { statusCode?: number; body?: unknown } = {};
    res.status = (code: number) => { res.statusCode = code; return res as unknown as Response; };
    res.json = (body: unknown) => { res.body = body; return res as unknown as Response; };
    let nextCalled = false;

    jwtAuthMiddleware(req as Request, res as unknown as Response, () => { nextCalled = true; });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it('DEV_MODE 自动 admin 会话 orgId 取 SYNOVA_ORG_ID 配置值（D479）', () => {
    const prevOrg = process.env.SYNOVA_ORG_ID;
    const prevSecret = process.env.JWT_SECRET;
    const prevDev = process.env.DEV_MODE;
    process.env.SYNOVA_ORG_ID = 'org-x';
    delete process.env.JWT_SECRET; // 触发 DEV_MODE 无密钥分支
    process.env.DEV_MODE = 'true';
    try {
      const req: Record<string, unknown> & { path: string; headers: Record<string, string>; auth?: unknown } = {
        path: '/api/workspaces',
        headers: {},
      };
      const res: Record<string, unknown> & { statusCode?: number } = {};
      res.status = (code: number) => { res.statusCode = code; return res as unknown as Response; };
      res.json = (body: unknown) => { return res as unknown as Response; };
      let nextCalled = false;

      jwtAuthMiddleware(req as unknown as Request, res as unknown as Response, () => { nextCalled = true; });

      expect(nextCalled).toBe(true);
      expect(res.statusCode).toBeUndefined();
      expect(req.auth).toBeTruthy();
      // D479: DEV_MODE 会话不得落字面 'default'，须与 config.orgId 同源（SYNOVA_ORG_ID）
      expect((req.auth as Record<string, unknown>)?.orgId).toBe('org-x');
    } finally {
      if (prevOrg === undefined) delete process.env.SYNOVA_ORG_ID;
      else process.env.SYNOVA_ORG_ID = prevOrg;
      if (prevSecret !== undefined) process.env.JWT_SECRET = prevSecret;
      if (prevDev !== undefined) process.env.DEV_MODE = prevDev;
    }
  });
});

// ============================================================
// extractAuthFromRequest — 桥接 JWT → RBAC
// ============================================================

describe('extractAuthFromRequest', () => {
  it('从有 auth 的请求返回角色和用户ID', () => {
    const req = {
      auth: { sub: 'ga_user', role: 'ga', orgId: 'org-1', iat: 0, exp: 0, jti: 'test' },
    };
    const result = extractAuthFromRequest(req as never);
    expect(result).toBeTruthy();
    expect(result!.role).toBe('ga');
    expect(result!.userId).toBe('ga_user');
    expect(result!.orgId).toBe('org-1');
  });

  it('从无 auth 的请求返回 null', () => {
    const req = {};
    const result = extractAuthFromRequest(req as never);
    expect(result).toBeNull();
  });

  it('支持 x-synova-token 向下兼容', () => {
    const req = { headers: { 'x-synova-token': 'admin:dev:user1' } };
    const result = extractAuthFromRequest(req as never);
    expect(result).toBeTruthy();
    expect(result!.role).toBe('admin');
    expect(result!.userId).toBe('user1');
  });

  it('x-synova-token 格式不对时返回 null', () => {
    const req = { headers: { 'x-synova-token': 'not-a-valid-format' } };
    const result = extractAuthFromRequest(req as never);
    expect(result).toBeNull();
  });

  it('legacy x-synova-token 缺 orgId 段 + SYNOVA_ORG_ID 已配置 → orgId 取配置值（D479）', () => {
    const prevOrg = process.env.SYNOVA_ORG_ID;
    process.env.SYNOVA_ORG_ID = 'org-x';
    try {
      // 'admin::user1' = role:orgId:userId，orgId 段为空 → 回退实例 org（SYNOVA_ORG_ID）
      const req = { headers: { 'x-synova-token': 'admin::user1' } };
      const result = extractAuthFromRequest(req as never);
      expect(result).toBeTruthy();
      expect(result!.orgId).toBe('org-x');
      expect(result!.role).toBe('admin');
      expect(result!.userId).toBe('user1');

      // 兜底契约保持：SYNOVA_ORG_ID 未配置时最终回落 'default'（与 config.ts L96 同源）
      delete process.env.SYNOVA_ORG_ID;
      const fallback = extractAuthFromRequest({ headers: { 'x-synova-token': 'admin::user2' } } as never);
      expect(fallback!.orgId).toBe('default');
    } finally {
      if (prevOrg === undefined) delete process.env.SYNOVA_ORG_ID;
      else process.env.SYNOVA_ORG_ID = prevOrg;
    }
  });
});
