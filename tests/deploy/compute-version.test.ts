/**
 * tests/deploy/compute-version.test.ts — D48 Compute 版本追踪测试
 *
 * 覆盖:
 *   - getComputeVersion: 返回 latestVersion + contracts 映射
 *   - getComputeVersion: 空输入
 *   - compareComputeCompatibility: 完全相同 → 兼容
 *   - compareComputeCompatibility: 新增 contract → 兼容
 *   - compareComputeCompatibility: 版本变更 → 兼容
 *   - compareComputeCompatibility: 移除 contract → 不兼容
 */
import { describe, it, expect } from 'vitest';
import { getComputeVersion, compareComputeCompatibility } from '../../src/deploy/compute-version';

describe('D48: compute-version — getComputeVersion', () => {
  it('返回版本映射和最新版本号', () => {
    const result = getComputeVersion([
      { contractId: 'compute/margin/gross-profit', name: 'grossProfit', version: 3 },
      { contractId: 'compute/capital/roic', name: 'roic', version: 1 },
    ]);

    expect(result.totalContracts).toBe(2);
    expect(result.latestVersion).toBe(3);
    expect(result.contracts['compute/margin/gross-profit']).toBe(3);
    expect(result.contracts['compute/capital/roic']).toBe(1);
  });

  it('空输入返回零值', () => {
    const result = getComputeVersion([]);
    expect(result.totalContracts).toBe(0);
    expect(result.latestVersion).toBe(0);
    expect(result.contracts).toEqual({});
  });

  it('处理重复 contractId (取最后出现的版本)', () => {
    const result = getComputeVersion([
      { contractId: 'compute/margin/gross-profit', name: 'grossProfit', version: 2 },
      { contractId: 'compute/margin/gross-profit', name: 'grossProfitV2', version: 5 },
    ]);
    expect(result.contracts['compute/margin/gross-profit']).toBe(5);
    expect(result.latestVersion).toBe(5);
  });
});

describe('D48: compute-version — compareComputeCompatibility', () => {
  const baseContracts = [
    { contractId: 'compute/margin/gross-profit', name: 'grossProfit', version: 3 },
    { contractId: 'compute/capital/roic', name: 'roic', version: 1 },
  ];

  it('完全相同 → 兼容', () => {
    const result = compareComputeCompatibility(baseContracts, [...baseContracts]);
    expect(result.compatible).toBe(true);
    expect(result.added).toEqual([]);
    expect(result.changed).toEqual([]);
    expect(result.removed).toEqual([]);
  });

  it('新增 contract → 兼容', () => {
    const newContracts = [
      ...baseContracts,
      { contractId: 'compute/disk/free-space', name: 'freeSpace', version: 1 },
    ];
    const result = compareComputeCompatibility(baseContracts, newContracts);
    expect(result.compatible).toBe(true);
    expect(result.added).toEqual(['compute/disk/free-space']);
  });

  it('版本变更 → 兼容', () => {
    const newContracts = [
      { contractId: 'compute/margin/gross-profit', name: 'grossProfit', version: 4 },
      ...baseContracts.slice(1),
    ];
    const result = compareComputeCompatibility(baseContracts, newContracts);
    expect(result.compatible).toBe(true);
    expect(result.changed).toEqual(['compute/margin/gross-profit']);
  });

  it('移除 contract → 不兼容', () => {
    const newContracts = baseContracts.slice(0, 1); // 只保留第一个
    const result = compareComputeCompatibility(baseContracts, newContracts);
    expect(result.compatible).toBe(false);
    expect(result.removed).toEqual(['compute/capital/roic']);
    expect(result.blockedReason).toBeTruthy();
    expect(result.blockedReason).toContain('compute/capital/roic');
  });

  it('空新旧对比 → 新增为空, 移除为全部', () => {
    const result = compareComputeCompatibility(baseContracts, []);
    expect(result.compatible).toBe(false);
    expect(result.removed).toHaveLength(2);
    expect(result.added).toEqual([]);
  });

  it('从空到有 → 全部新增', () => {
    const result = compareComputeCompatibility([], baseContracts);
    expect(result.compatible).toBe(true);
    expect(result.added).toHaveLength(2);
    expect(result.removed).toEqual([]);
  });
});
