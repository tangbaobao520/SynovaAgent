import { describe, it, expect } from 'vitest';

describe('atomic-write', () => {
  it('模块加载成功', async () => {
    const mod = await import('../../src/agent/atomic-write');
    expect(mod).toBeDefined();
  });
});
