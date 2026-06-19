import { describe, it, expect } from 'vitest';

describe('knowledge-conflict-handler', () => {
  it('模块加载成功', async () => {
    const mod = await import('../src/agent/knowledge-conflict-handler');
    expect(mod).toBeDefined();
  });
});
