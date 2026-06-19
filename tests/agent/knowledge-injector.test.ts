import { describe, it, expect } from 'vitest';

describe('knowledge-injector', () => {
  it('模块加载成功', async () => {
    const mod = await import('../../src/agent/knowledge-injector');
    expect(mod).toBeDefined();
  });
});
