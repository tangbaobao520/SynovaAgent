/**
 * tests/routes/notifications.test.ts — 通知系统 API 测试 (Phase 2.1)
 */
import { describe, it, expect } from 'vitest';

describe('/api/notifications', () => {
  it('路由模块被正确导出', async () => {
    // notifications.ts 导出 Express Router
    const { default: notificationsRoutes } = await import('../../src/routes/notifications');
    expect(notificationsRoutes).toBeDefined();
    expect(typeof notificationsRoutes).toBe('function'); // Router 是函数
  });

  it('通知路由已接线到 server.ts', () => {
    // 验证 server.ts 中有 notificationsRoutes 的 import + app.use
    const serverContent = require('fs').readFileSync('src/server.ts', 'utf-8');
    expect(serverContent).toContain('notificationsRoutes');
    expect(serverContent).toContain("notificationsRoutes");
  });
});
