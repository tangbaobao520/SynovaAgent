/**
 * tests/l3/platform-dependency-check.test.ts — 平台依赖检查模块测试
 *
 * 消费边: DEPENDS_ON_PLATFORM
 * 测试: 正常路径 + 降级路径
 */
import { describe, it, expect } from 'vitest';
import { checkPlatformDependencies } from '../../src/l3/platform-dependency-check';

describe('checkPlatformDependencies', () => {
  it('正常路径: 有DEPENDS_ON_PLATFORM数据', async () => {
    const store = {
      queryNodes: () => [{ id: 'prod-001', type: 'activity/production', props: {} }],
      queryEdges: () => [],
      getNode: () => null,
    };
    const traversal = {
      traverse: (_start: string[], _types: string[]) => ({
        nodes: [{ id: 'comp-001', type: 'outcome/competitive', props: { market_share: 0.3 } }],
        edges: [{ id: 'dop-001', type: 'DEPENDS_ON_PLATFORM', from: 'prod-001', to: 'comp-001', weight: 0.8, props: { dependency_depth: 0.7, platform_substitutability: 0.3 } }],
        path: [], degraded: false, warnings: [],
      }),
      getTemporalParams: () => ({ current: 0, window_3m: { mean: 0, slope: 0, variance: 0 }, window_12m: { mean: 0, slope: 0, variance: 0 }, trend: 'stable' as const }),
      scanOutliers: () => [],
      evaluateEdges: () => [],
    };
    const result = await checkPlatformDependencies(store, 't1', traversal);
    expect(result.degraded).toBe(false);
    expect(result.totalDependencies).toBe(1);
    expect(result.avgDependencyDepth).toBe(0.7);
    expect(result.findings.length).toBeGreaterThanOrEqual(1);
  });

  it('降级路径: 无DEPENDS_ON_PLATFORM数据', async () => {
    const store = {
      queryNodes: () => [],
      queryEdges: () => [],
      getNode: () => null,
    };
    const traversal = {
      traverse: (_start: string[], _types: string[]) => ({
        nodes: [], edges: [], path: [], degraded: true, warnings: ['No data'],
      }),
      getTemporalParams: () => ({ current: 0, window_3m: { mean: 0, slope: 0, variance: 0 }, window_12m: { mean: 0, slope: 0, variance: 0 }, trend: 'stable' as const }),
      scanOutliers: () => [],
      evaluateEdges: () => [],
    };
    const result = await checkPlatformDependencies(store, 't1', traversal);
    expect(result.degraded).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.totalDependencies).toBe(0);
  });
});
