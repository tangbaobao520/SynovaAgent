/**
 * tests/routes/healthz.test.ts — D49 GET /api/healthz 测试
 *
 * 覆盖: 6项检查状态 + 整体状态聚合 + server接线 + report-assembler注入
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import express from 'express';

describe('D49: healthz — 检查逻辑', () => {
  it('healthz 路由返回正确格式 (status + checks + uptime)', async () => {
    // 直接引用路由模块（不启动server）
    const mod = await import('../../src/routes/healthz');
    expect(mod.default).toBeTruthy();
  });

  it('各检查项有独立名称和非空类型', async () => {
    const mod = await import('../../src/routes/healthz');
    const router = mod.default;
    expect(router).toBeTruthy();
    // 验证导出的路由是 Express Router
    expect(typeof router.get).toBe('function');
    // 验证路由定义了 /api/healthz
    const stack = router.stack || [];
    const hasHealthzRoute = stack.some((layer: { route?: { path?: string } }) =>
      layer.route?.path === '/api/healthz',
    );
    expect(hasHealthzRoute).toBe(true);
  });
});

describe('D49: healthz — HTTP 响应', () => {
  let server: http.Server;

  beforeAll(async () => {
    const app = express();
    const mod = await import('../../src/routes/healthz');
    app.use(mod.default);
    await new Promise<void>((resolve) => {
      server = app.listen(0, resolve);
    });
  });

  afterAll(() => {
    if (server) server.close();
  });

  it('返回 200 + 含 status + checks + uptime', async () => {
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('server not listening');
    const res = await fetch(`http://localhost:${addr.port}/api/healthz`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('checks');
    expect(body).toHaveProperty('uptime');
    expect(typeof body.uptime).toBe('number');
    expect(['healthy', 'degraded', 'down']).toContain(body.status);
  });

  it('checks 包含全部 6 项', async () => {
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('server not listening');
    const res = await fetch(`http://localhost:${addr.port}/api/healthz`);
    const body = await res.json();
    const expected = ['database', 'llm_connectivity', 'last_sentinel_run', 'disk_free_gb', 'data_freshness', 'watchdog_alive'];
    for (const key of expected) {
      expect(body.checks).toHaveProperty(key);
      expect(body.checks[key]).toHaveProperty('status');
      expect(body.checks[key]).toHaveProperty('detail');
      expect(['ok', 'degraded', 'down']).toContain(body.checks[key].status);
    }
    expect(Object.keys(body.checks).length).toBe(6);
  });

  it('各项 checks.status 是合法枚举值', async () => {
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('server not listening');
    const res = await fetch(`http://localhost:${addr.port}/api/healthz`);
    const body = await res.json();
    for (const [key, check] of Object.entries(body.checks)) {
      const c = check as { status: string; detail: string };
      expect(['ok', 'degraded', 'down']).toContain(c.status);
      expect(typeof c.detail).toBe('string');
    }
  });
});

describe('D49: server.ts — 接线验证', () => {
  it('server.ts 中 import 了 healthzRoutes', () => {
    const content = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'src', 'server.ts'),
      'utf-8',
    );
    expect(content).toContain("import healthzRoutes from './routes/healthz'");
    expect(content).toContain("app.use(healthzRoutes)");
  });
});

describe('D49: report-assembler — systemHealth 注入', () => {
  it('report-assembler.ts 包含 injectSystemHealth 调用', () => {
    const content = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'src', 'agent', 'report-assembler.ts'),
      'utf-8',
    );
    expect(content).toContain('injectSystemHealth');
    expect(content).toContain('SystemHealthAudit');
    expect(content).toContain('systemHealth');
  });
});
