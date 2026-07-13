/**
 * tests/routes/backup.test.ts — D50 备份路由测试
 *
 * 覆盖: server接线 + API端点存在性
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('D50: backup routes — 接线验证', () => {
  it('server.ts 中 import 了 backupRoutes', () => {
    const content = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'src', 'server.ts'),
      'utf-8',
    );
    expect(content).toContain("import backupRoutes from './routes/backup'");
    expect(content).toContain("app.use(backupRoutes)");
  });

  it('backup 路由定义了 4 个端点', async () => {
    const mod = await import('../../src/routes/backup');
    const router = mod.default;
    expect(router).toBeTruthy();
    expect(typeof router.get).toBe('function');
    expect(typeof router.post).toBe('function');

    const stack = router.stack || [];
    const paths = stack
      .filter((l: { route?: { path?: string; methods?: Record<string, boolean> } }) => l.route)
      .map((l: { route?: { path?: string } }) => l.route?.path);

    // 应包含 /api/backup/create, /api/backup/status, /api/backup/restore, /api/backup/verify
    expect(paths.length).toBeGreaterThanOrEqual(4);
  });
});
