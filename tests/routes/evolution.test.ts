import { describe, it, expect } from 'vitest';

/**
 * routes/evolution.ts 测试。
 * 验证路由注册和基础行为，不启动真实 HTTP 服务器。
 * 完整集成测试需要真实的 SQLite + AgentMemoryStore。
 */
describe('routes/evolution', () => {
  it('router 被正确导出了', async () => {
    const mod = await import('../../src/routes/evolution');
    expect(mod.default).toBeDefined();
    // Express Router 有 get/post 方法
    expect(typeof (mod.default as { get: unknown }).get).toBe('function');
    expect(typeof (mod.default as { post: unknown }).post).toBe('function');
  });

  it('路由路径包含 /api/evolution/', async () => {
    const mod = await import('../../src/routes/evolution');
    const router = mod.default as {
      stack?: Array<{ route?: { path: string } }>;
    };
    const paths = (router.stack || [])
      .filter((layer: unknown) => (layer as { route?: { path: string } }).route?.path)
      .map((layer: unknown) => (layer as { route: { path: string } }).route.path);

    expect(paths.length).toBeGreaterThanOrEqual(4);
    expect(paths.some(p => p.includes('/api/evolution/proposals'))).toBe(true);
    expect(paths.some(p => p.includes('/api/evolution/aggregate'))).toBe(true);
  });
});
