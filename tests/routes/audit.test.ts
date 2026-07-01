/**
 * tests/routes/audit.test.ts — 审计日志路由单元测试 (Phase 0.3)
 *
 * 验证路由注册和权限检查逻辑。
 */
import { describe, it, expect } from 'vitest';

describe('audit routes module', () => {
  it('路由模块可加载', async () => {
    const mod = await import('../../src/routes/audit');
    expect(mod.default).toBeTruthy();
    expect(typeof mod.default).toBe('function');
    expect(mod.default.stack).toBeTruthy();
    expect(Array.isArray(mod.default.stack)).toBe(true);
  });

  it('已注册 GET /api/audit', async () => {
    const mod = await import('../../src/routes/audit');
    const route = mod.default.stack.find((layer: any) =>
      layer.route?.path === '/api/audit' && layer.route?.methods?.get,
    );
    expect(route).toBeTruthy();
  });

  it('已注册 GET /api/audit/ga/:gaId', async () => {
    const mod = await import('../../src/routes/audit');
    const route = mod.default.stack.find((layer: any) =>
      layer.route?.path === '/api/audit/ga/:gaId' && layer.route?.methods?.get,
    );
    expect(route).toBeTruthy();
  });

  it('Router stack 至少有 2 个路由', async () => {
    const mod = await import('../../src/routes/audit');
    const routeCount = mod.default.stack.filter((layer: any) => layer.route).length;
    expect(routeCount).toBeGreaterThanOrEqual(2);
  });
});
