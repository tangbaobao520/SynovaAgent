/**
 * tests/sentinel/compute-degraded.test.ts
 * V3.7 Batch 2 — compute degraded wrapper 单元测试
 */
import { describe, it, expect } from 'vitest';
import { loadComputeDegraded } from '../../src/sentinel/compute-degraded';

describe('loadComputeDegraded', () => {
  it('始终返回 null', async () => {
    const result = await loadComputeDegraded('test-module');
    expect(result).toBeNull();
  });

  it('对不同模块名都返回 null', async () => {
    expect(await loadComputeDegraded('cpc')).toBeNull();
    expect(await loadComputeDegraded('htm')).toBeNull();
    expect(await loadComputeDegraded('hona')).toBeNull();
  });
});
