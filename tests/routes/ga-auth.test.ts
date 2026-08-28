/**
 * tests/routes/ga-auth.test.ts — D551 共享 GA 认证 requireGa（ga-annotations L44-60 模式提取）
 *
 * 覆盖（正常/降级/边界，铁律 48）:
 *   - 401 无认证上下文 / 400 缺 orgId（D338 fail-closed）/ 403 非 ga-admin（三态）
 *   - ga / admin 角色放行（200 路径返回 true）
 *   - legacy x-synova-token header 向下兼容路径（middleware/auth 既有语义，提取不回改验证）
 */
import { describe, it, expect } from 'vitest';
import type { Request, Response } from 'express';

describe('requireGa 共享认证（D551）', () => {
  async function loadRequireGa() {
    const mod = await import('../../src/routes/ga-auth');
    return mod.requireGa;
  }

  function makeRes(): { res: Response; status: () => number; body: () => Record<string, unknown> } {
    const captured: { code: number; json: Record<string, unknown> | undefined } = { code: 200, json: undefined };
    const res = {
      status(code: number): Response { captured.code = code; return res as unknown as Response; },
      json(b: unknown): Response { captured.json = b as Record<string, unknown>; return res as unknown as Response; },
    } as unknown as Response;
    return { res, status: () => captured.code, body: () => captured.json ?? {} };
  }

  function makeReq(auth?: unknown, headers?: Record<string, unknown>): Request {
    const req: Record<string, unknown> = { headers: headers ?? {} };
    if (auth !== undefined) req.auth = auth;
    return req as unknown as Request;
  }

  it('无认证上下文 → 401 UNAUTHORIZED + 返回 false', async () => {
    const requireGa = await loadRequireGa();
    const { res, status, body } = makeRes();
    const ok = requireGa(makeReq(), res);
    expect(ok).toBe(false);
    expect(status()).toBe(401);
    expect(body().code).toBe('UNAUTHORIZED');
  });

  it('auth 缺 orgId → 400 ORG_REQUIRED（D338 fail-closed，不回落 default）', async () => {
    const requireGa = await loadRequireGa();
    const { res, status, body } = makeRes();
    const ok = requireGa(makeReq({ sub: 'u1', role: 'ga', orgId: '' }), res);
    expect(ok).toBe(false);
    expect(status()).toBe(400);
    expect(body().code).toBe('ORG_REQUIRED');
  });

  it('非 ga/admin 角色 → 403 FORBIDDEN', async () => {
    const requireGa = await loadRequireGa();
    const { res, status, body } = makeRes();
    const ok = requireGa(makeReq({ sub: 'u1', role: 'staff', orgId: 'org-1' }), res);
    expect(ok).toBe(false);
    expect(status()).toBe(403);
    expect(body().code).toBe('FORBIDDEN');
  });

  it('ga 角色放行 → true（零响应写入）', async () => {
    const requireGa = await loadRequireGa();
    const { res, status, body } = makeRes();
    const ok = requireGa(makeReq({ sub: 'ga-1', role: 'ga', orgId: 'org-1' }), res);
    expect(ok).toBe(true);
    expect(status()).toBe(200);
    expect(body().ok).toBeUndefined();
  });

  it('admin 角色放行 → true（边界: admin 与 ga 同权）', async () => {
    const requireGa = await loadRequireGa();
    const { res, status } = makeRes();
    const ok = requireGa(makeReq({ sub: 'admin-1', role: 'admin', orgId: 'org-1' }), res);
    expect(ok).toBe(true);
    expect(status()).toBe(200);
  });

  it('legacy x-synova-token header 路径: ga:org:userId 放行（middleware/auth 既有语义不回改）', async () => {
    const requireGa = await loadRequireGa();
    const { res, status } = makeRes();
    const ok = requireGa(makeReq(undefined, { 'x-synova-token': 'ga:org-d551:ga-legacy' }), res);
    expect(ok).toBe(true);
    expect(status()).toBe(200);
  });
});
