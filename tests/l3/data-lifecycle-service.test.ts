/**
 * tests/l3/data-lifecycle-service.test.ts — D40 数据生命周期服务单元测试
 *
 * 铁律 48: 测试必须有 expect() 断言
 * 覆盖: PolicyEngine checkPolicy / 模块完整性
 */
import { describe, it, expect } from 'vitest';

describe('data-lifecycle-service', () => {
  it('GA 角色对 data.export 返回拒绝', async () => {
    const { checkPolicy } = await import('../../src/l3/data-lifecycle-service');
    const result = checkPolicy('ga', 'data.export');
    expect(result).not.toBeNull();
    expect(result).toContain('deny');
  });

  it('boss 角色对 data.export 返回通过', async () => {
    const { checkPolicy } = await import('../../src/l3/data-lifecycle-service');
    const result = checkPolicy('boss', 'data.export');
    expect(result).toBeNull();
  });

  it('GA 角色对 data.delete 返回拒绝', async () => {
    const { checkPolicy } = await import('../../src/l3/data-lifecycle-service');
    const result = checkPolicy('ga', 'data.delete');
    expect(result).not.toBeNull();
  });

  it('service 模块可正常导入且导出全部 API', async () => {
    const mod = await import('../../src/l3/data-lifecycle-service');
    expect(mod.checkPolicy).toBeDefined();
    expect(mod.executeExport).toBeDefined();
    expect(mod.executePurge).toBeDefined();
    expect(mod.queryPurgeStatus).toBeDefined();
  });
});
