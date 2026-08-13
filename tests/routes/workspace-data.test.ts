/**
 * tests/routes/workspace-data.test.ts — D74 工作台数据 API 端点测试
 */
import { describe, it, expect } from 'vitest';

describe('D74: workspace-data routes — 路由注册', () => {
  it('导出默认 Router 实例', async () => {
    const router = await import('../../src/routes/workspace-data');
    expect(router.default).toBeDefined();
    // Router 实例应有 stack（已注册的路由）
    expect(Array.isArray((router.default as any).stack)).toBe(true);
  });

  it('已注册 5 个端点', async () => {
    const router = await import('../../src/routes/workspace-data');
    const stack = (router.default as any).stack as Array<{ route: { path: string; methods: Record<string, boolean> } }>;
    expect(stack.length).toBeGreaterThanOrEqual(4);

    // 验证路由路径
    const paths = stack
      .filter((r) => r.route)
      .map((r) => ({ path: r.route.path, methods: Object.keys(r.route.methods) }));
    expect(paths.some((p) => p.path === '/api/workspace/:deptId')).toBe(true);
    expect(paths.some((p) => p.path === '/api/workspace/:deptId/goals')).toBe(true);
    expect(paths.some((p) => p.path === '/api/workspace/:deptId/alerts')).toBe(true);
    expect(paths.some((p) => p.path === '/api/workspace/:deptId/next-action')).toBe(true);
    expect(paths.some((p) => p.path === '/api/workspace/alerts/:id/dismiss')).toBe(true);
  });

  it('GET /api/workspace/:deptId 返回 json 结构', async () => {
    const express = await import('express');
    const app = express.default();
    const router = await import('../../src/routes/workspace-data');
    app.use(router.default);

    // 模拟请求
    const http = await import('http');
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;

    try {
      const response = await fetch(`http://localhost:${port}/api/workspace/test-dept`);
      const data = await response.json();
      expect(data).toHaveProperty('ok');
      expect(data).toHaveProperty('data');
      expect(data.data).toHaveProperty('departmentId', 'test-dept');
    } finally {
      server.close();
    }
  });
});
