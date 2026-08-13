/**
 * tests/agent/data-lifecycle-service.test.ts — D40 L2 bridge 测试
 *
 * 铁律 48: 测试必须有 expect() 断言
 * 验证 L2 bridge 正确 re-export L3 函数
 */
import { describe, it, expect } from 'vitest';

describe('agent/data-lifecycle-service bridge', () => {
  it('re-exports checkPolicy from L3', async () => {
    const bridge = await import('../../src/agent/data-lifecycle-service');
    expect(bridge.checkPolicy).toBeDefined();
    expect(typeof bridge.checkPolicy).toBe('function');
  });

  it('re-exports executeExport from L3', async () => {
    const bridge = await import('../../src/agent/data-lifecycle-service');
    expect(bridge.executeExport).toBeDefined();
    expect(typeof bridge.executeExport).toBe('function');
  });

  it('re-exports executePurge from L3', async () => {
    const bridge = await import('../../src/agent/data-lifecycle-service');
    expect(bridge.executePurge).toBeDefined();
    expect(typeof bridge.executePurge).toBe('function');
  });

  it('re-exports queryPurgeStatus from L3', async () => {
    const bridge = await import('../../src/agent/data-lifecycle-service');
    expect(bridge.queryPurgeStatus).toBeDefined();
    expect(typeof bridge.queryPurgeStatus).toBe('function');
  });

  it('checkPolicy via bridge: GA rejected, boss allowed', async () => {
    const { checkPolicy } = await import('../../src/agent/data-lifecycle-service');
    const gaResult = checkPolicy('ga', 'data.export');
    expect(gaResult).not.toBeNull();
    expect(gaResult).toContain('deny');

    const bossResult = checkPolicy('boss', 'data.export');
    expect(bossResult).toBeNull();
  });
});
