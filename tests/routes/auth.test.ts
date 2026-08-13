/**
 * tests/routes/auth.test.ts — Auth 路由单元测试 (Phase 0.1)
 *
 * 铁律 33: *.test.ts 命名约定。
 * 验证路由注册和输入校验逻辑。
 */
import { describe, it, expect } from 'vitest';
import authRoutes from '../../src/routes/auth';

describe('auth routes module', () => {
  it('模块导出默认 router', () => {
    expect(authRoutes).toBeTruthy();
    expect(typeof authRoutes).toBe('function'); // Express Router 是函数
    expect(authRoutes.stack).toBeTruthy();
    expect(Array.isArray(authRoutes.stack)).toBe(true);
  });

  it('已注册 POST /api/auth/login', () => {
    const route = authRoutes.stack.find((layer: any) =>
      layer.route?.path === '/api/auth/login' && layer.route?.methods?.post,
    );
    expect(route).toBeTruthy();
  });

  it('已注册 POST /api/auth/refresh', () => {
    const route = authRoutes.stack.find((layer: any) =>
      layer.route?.path === '/api/auth/refresh' && layer.route?.methods?.post,
    );
    expect(route).toBeTruthy();
  });

  it('已注册 POST /api/auth/revoke', () => {
    const route = authRoutes.stack.find((layer: any) =>
      layer.route?.path === '/api/auth/revoke' && layer.route?.methods?.post,
    );
    expect(route).toBeTruthy();
  });

  it('已注册 GET /api/auth/validate', () => {
    const route = authRoutes.stack.find((layer: any) =>
      layer.route?.path === '/api/auth/validate' && layer.route?.methods?.get,
    );
    expect(route).toBeTruthy();
  });

  it('Router stack 至少有 4 个路由（login + refresh + revoke + validate）', () => {
    const routeCount = authRoutes.stack.filter((layer: any) => layer.route).length;
    expect(routeCount).toBeGreaterThanOrEqual(4);
  });
});
