/**
 * tests/routes/data-lifecycle.test.ts — D40 数据生命周期路由集成测试
 *
 * 铁律 48: 测试必须有 expect() 断言
 * 覆盖: 路由注册 / checkPolicy 集成
 */
import { describe, it, expect } from 'vitest';

describe('data-lifecycle 路由注册', () => {
  it('路由模块可正常导入', async () => {
    const mod = await import('../../src/routes/data-lifecycle');
    expect(mod.default).toBeDefined();
    const router = mod.default;
    expect(typeof router.stack).toBe('object');
    expect(router.stack.length).toBeGreaterThanOrEqual(3);
  });

  it('checkPolicy GA 角色对 data.export 返回拒绝', async () => {
    const { checkPolicy } = await import('../../src/l3/data-lifecycle-service');
    const result = checkPolicy('ga', 'data.export');
    expect(result).not.toBeNull();
    expect(result).toContain('deny');
  });

  it('checkPolicy boss 角色对 data.export 返回通过', async () => {
    const { checkPolicy } = await import('../../src/l3/data-lifecycle-service');
    const result = checkPolicy('boss', 'data.export');
    expect(result).toBeNull();
  });
});
