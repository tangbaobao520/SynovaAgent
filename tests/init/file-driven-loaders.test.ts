/**
 * tests/init/file-driven-loaders.test.ts
 * v3.6 Batch 1 — file-driven loader 初始化测试
 */
import { describe, it, expect } from 'vitest';
import { initFileDrivenLoaders } from '../../src/init/file-driven-loaders';

describe('initFileDrivenLoaders', () => {
  it('初始化不抛出异常（降级模式）', async () => {
    await expect(initFileDrivenLoaders()).resolves.toBeUndefined();
  });

  it('返回 Promise<void>', () => {
    const result = initFileDrivenLoaders();
    expect(result).toBeInstanceOf(Promise);
  });

  it('多次调用不抛出异常（幂等）', async () => {
    await initFileDrivenLoaders();
    await expect(initFileDrivenLoaders()).resolves.toBeUndefined();
  });
});
