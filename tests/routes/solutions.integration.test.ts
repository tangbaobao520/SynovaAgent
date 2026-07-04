/**
 * tests/routes/solutions.integration.test.ts — 方案生成链路集成测试 (Phase 3.4)
 *
 * 验证: POST /api/solutions/generate → GET /api/solutions → PUT 状态流转 → POST push
 * 铁律 33: *.integration.test.ts (涉及 Express 路由 + in-memory store)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import solutionsRouter from '../../src/routes/solutions';

describe('Phase 3.4 方案生成链路集成测试', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());

    // 注入模拟 JWT 认证（匹配 JwtPayload 格式）
    app.use((req, _res, next) => {
      (req as any).auth = { sub: 'test-ga', role: 'ga', orgId: 'test-org', iat: 0, exp: 9999999999, jti: 'test' };
      next();
    });

    app.use(solutionsRouter);

    return new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr !== 'string') {
          baseUrl = `http://localhost:${addr.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(() => {
    return new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  // ═══ 测试用例 ═══

  it('POST /api/solutions/generate — 生成方案 (无 recommendations, 无 sentinelIds)', async () => {
    const res = await fetch(`${baseUrl}/api/solutions/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reportId: 'test-report-001',
        sentinelIds: [],
        recommendations: [],
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.solutions)).toBe(true);
  });

  it('POST /api/solutions/generate — 拒绝缺少 reportId', async () => {
    const res = await fetch(`${baseUrl}/api/solutions/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('GET /api/solutions — 返回方案列表', async () => {
    // 先生成一个方案
    await fetch(`${baseUrl}/api/solutions/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportId: 'test-report-002', sentinelIds: [], recommendations: [] }),
    });

    const res = await fetch(`${baseUrl}/api/solutions?reportId=test-report-002`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.solutions.length).toBeGreaterThanOrEqual(1);
    expect(body.solutions[0].reportId).toBe('test-report-002');
  });

  it('PUT /api/solutions/:id/status — 状态流转 draft → confirmed', async () => {
    // 先生成方案
    const genRes = await fetch(`${baseUrl}/api/solutions/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportId: 'test-report-003', sentinelIds: [], recommendations: [] }),
    });
    const genBody = await genRes.json();
    const solutionId = genBody.solutions[0].id;

    // 流转为 confirmed
    const statusRes = await fetch(`${baseUrl}/api/solutions/${solutionId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'confirmed' }),
    });
    expect(statusRes.status).toBe(200);
    const statusBody = await statusRes.json();
    expect(statusBody.ok).toBe(true);
    expect(statusBody.status).toBe('confirmed');
  });

  it('PUT /api/solutions/:id/status — 拒绝非法状态流转 (completed → draft)', async () => {
    const genRes = await fetch(`${baseUrl}/api/solutions/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportId: 'test-report-004', sentinelIds: [], recommendations: [] }),
    });
    const genBody = await genRes.json();
    const solutionId = genBody.solutions[0].id;

    // 先设为 completed
    await fetch(`${baseUrl}/api/solutions/${solutionId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    });

    // 尝试回退到 draft — 非法
    const invalidRes = await fetch(`${baseUrl}/api/solutions/${solutionId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'draft' }),
    });
    expect(invalidRes.status).toBe(400);
    const body = await invalidRes.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe('INVALID_TRANSITION');
  });

  it('PUT /api/solutions/:id/status — 拒绝无效 status 值', async () => {
    const res = await fetch(`${baseUrl}/api/solutions/nonexistent/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'invalid_status' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  it('POST /api/solutions/:id/push — 推送方案给对接人', async () => {
    // 先生成方案
    const genRes = await fetch(`${baseUrl}/api/solutions/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportId: 'test-report-005', sentinelIds: [], recommendations: [] }),
    });
    const genBody = await genRes.json();
    const solutionId = genBody.solutions[0].id;

    // 推送
    const pushRes = await fetch(`${baseUrl}/api/solutions/${solutionId}/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channels: ['electron'] }),
    });
    expect(pushRes.status).toBe(200);
    const pushBody = await pushRes.json();
    expect(pushBody.ok).toBe(true);
    expect(pushBody.note).toBe('方案已推送');
  });

  it('GET /api/solutions/:id — 返回单个方案', async () => {
    const genRes = await fetch(`${baseUrl}/api/solutions/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportId: 'test-report-006', sentinelIds: [], recommendations: [] }),
    });
    const genBody = await genRes.json();
    const solutionId = genBody.solutions[0].id;

    const res = await fetch(`${baseUrl}/api/solutions/${solutionId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.solution.id).toBe(solutionId);
  });

  it('GET /api/solutions/:id — 不存在返回 404', async () => {
    const res = await fetch(`${baseUrl}/api/solutions/nonexistent-solution-id`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe('NOT_FOUND');
  });

  it('POST /api/solutions/:id/push — 不存在返回 pushed=false', async () => {
    const res = await fetch(`${baseUrl}/api/solutions/nonexistent/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.note).toBe('方案不存在');
  });
});
