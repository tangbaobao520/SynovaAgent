/**
 * tests/sentinels/path-dependency/detect.test.ts
 * PathDependency compute 契约测试（D379 更新: 旧契约 {value, threshold, metadata} 已弃用，
 * dev doc §4.5 决策 A 定新契约 {value, degraded, evidence}）。
 * 无 as any（铁律 38）。
 */
import { describe, it, expect } from 'vitest';
import { detectPathDependency } from '../../../extensions/sentinels/path-dependency/computes/detect';

const mockStore = {
  queryNodes: () => [],
  queryEdges: () => [],
};

describe('PathDependency', () => {
  it('返回新契约结构 {value, degraded, evidence}', async () => {
    const r = await detectPathDependency(mockStore, 'test-team');
    expect(r).toHaveProperty('value');
    expect(r).toHaveProperty('degraded');
    expect(r).toHaveProperty('evidence');
  });

  it('空图 → degraded: true（数据不足不产出 finding，铁律 31）', async () => {
    const r = await detectPathDependency(mockStore, 'test-team');
    expect(r.degraded).toBe(true);
    expect(r.value).toBe(0);
  });

  it('evidence 是数组', async () => {
    const r = await detectPathDependency(mockStore, 'test-team');
    expect(Array.isArray(r.evidence)).toBe(true);
  });
});
