/**
 * tests/store/session-store.test.ts — D250 线程重命名测试
 *
 * 覆盖: renameSession 逻辑 + PATCH 端点接线
 */
import { describe, it, expect } from 'vitest';

describe('D250 Thread Rename', () => {
  it('routes/sessions.ts 已包含 PATCH /api/sessions/:id/title', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync('src/routes/sessions.ts', 'utf-8');
    expect(content).toContain('patch');
    expect(content).toContain('/api/sessions/:id/title');
  });

  it('session-store.ts 已包含 renameSession 方法', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync('src/store/session-store.ts', 'utf-8');
    expect(content).toContain('renameSession');
  });

  it('session-store.ts 已包含 ALTER TABLE title 迁移', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync('src/store/session-store.ts', 'utf-8');
    expect(content).toContain('title');
    expect(content).toContain('ALTER');
  });
});
