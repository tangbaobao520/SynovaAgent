/**
 * tests/l3/assumption-monitor.test.ts — 外部假设监控模块测试
 *
 * 消费边: EXTERNAL_ASSUMPTION_BINDS
 * 测试: 正常路径 + 降级路径
 */
import { describe, it, expect } from 'vitest';
import { checkExternalAssumptions } from '../../src/l3/assumption-monitor';

describe('checkExternalAssumptions', () => {
  it('正常路径: 有EXTERNAL_ASSUMPTION_BINDS数据', async () => {
    const store = {
      queryNodes: () => [{ id: 'gov-001', type: 'activity/governance', props: {} }],
      queryEdges: () => [],
      getNode: () => null,
    };
    const traversal = {
      traverse: (_start: string[], _types: string[]) => ({
        nodes: [{ id: 'ext-001', type: 'outcome/external', props: { market_growth: 0.05 } }],
        edges: [{ id: 'ea-001', type: 'EXTERNAL_ASSUMPTION_BINDS', from: 'gov-001', to: 'ext-001', weight: 0.8, props: { exogenous_dependency_count: 3, counterfactual_test_exists: 0, single_channel_concentration: 0.6 } }],
        path: [], degraded: false, warnings: [],
      }),
      getTemporalParams: () => ({ current: 0, window_3m: { mean: 0, slope: 0, variance: 0 }, window_12m: { mean: 0, slope: 0, variance: 0 }, trend: 'stable' as const }),
      scanOutliers: () => [],
      evaluateEdges: () => [],
    };
    const result = await checkExternalAssumptions(store, 't1', traversal);
    expect(result.degraded).toBe(false);
    expect(result.totalAssumptions).toBe(1);
    expect(result.maxDependency).toBe(3);
    // hasCounterfactualTest = 0 → should warn about missing test
    expect(result.hasCounterfactualTest).toBe(false);
    expect(result.findings.length).toBeGreaterThanOrEqual(1);
  });

  it('降级路径: 无EXTERNAL_ASSUMPTION_BINDS数据', async () => {
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
    const result = await checkExternalAssumptions(store, 't1', traversal);
    expect(result.degraded).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.totalAssumptions).toBe(0);
  });
});
