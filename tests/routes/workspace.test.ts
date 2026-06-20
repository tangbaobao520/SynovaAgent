import { describe, it, expect } from 'vitest';

describe('Workspace Route', () => {
  it('模块加载成功', async () => {
    const mod = await import('../../src/routes/workspace');
    expect(mod.default).toBeDefined();
  });
});
