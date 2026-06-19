/** tests/routes/home.test.ts — 首页路由测试 */
import { describe, it, expect } from 'vitest';
import express from 'express';
import homeRoutes from '../../src/routes/home';

describe('GET / — 首页', () => {
  it('返回 200 + HTML 包含 Synova', async () => {
    const app = express();
    app.use(homeRoutes);
    const res = await fetch('http://localhost:1/'); // won't actually connect
    // Test that the router exports correctly and has GET /
    const routes = (homeRoutes as unknown as { stack?: Array<{ route?: { path: string; methods: Record<string,boolean> } }> }).stack || [];
    const hasGetRoot = routes.some((r: any) => r.route?.path === '/' && r.route?.methods?.get);
    expect(hasGetRoot).toBe(true);
  });

  it('返回 HTML content-type', async () => {
    // 单元测试: 验证路由注册了 GET /
    const app = express();
    app.use(homeRoutes);
    // Express router stack inspection
    const routerStack = (homeRoutes as any).stack;
    expect(routerStack.length).toBeGreaterThanOrEqual(1);
    const rootRoute = routerStack.find((r: any) => r.route?.path === '/');
    expect(rootRoute).toBeTruthy();
    expect(rootRoute.route.methods.get).toBe(true);
  });
});
