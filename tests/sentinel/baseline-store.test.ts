/** tests/sentinel/baseline-store.test.ts — 基线管理单元测试 */
import { describe, it, expect, beforeEach } from 'vitest';
import { BaselineStore, destroyBaselineStore, getBaselineStore } from '../../src/sentinel/baseline-store';
import type { SentinelFinding } from '../../src/sentinel/types';

function makeFindings(count: number, severity: 'critical' | 'warning' | 'info' = 'warning'): SentinelFinding[] {
  return Array.from({ length: count }, (_, i) => ({ id: `f-${i}`, severity, title: `Test ${i}`, description: '', evidence: [], suggestion: '', detectedAt: new Date().toISOString() }));
}

describe('BaselineStore', () => {
  beforeEach(() => destroyBaselineStore());

  it('Given 首次记录 → baselineReady=false', () => {
    const store = getBaselineStore();
    store.record('test-sentinel', makeFindings(3));
    expect(store.getBaseline('test-sentinel').baselineReady).toBe(false);
  });

  it('Given 3 次记录 → baselineReady=true', () => {
    const store = getBaselineStore();
    store.record('test-sentinel', makeFindings(2));
    store.record('test-sentinel', makeFindings(3));
    store.record('test-sentinel', makeFindings(4));
    const b = store.getBaseline('test-sentinel');
    expect(b.baselineReady).toBe(true);
    expect(b.totalRuns).toBe(3);
    expect(b.avgFindingCount).toBe(3);
  });

  it('Given 偏离 >2x 基线 → finding 升级为 critical', () => {
    const store = getBaselineStore();
    store.record('test-sentinel', makeFindings(2)); // run 1
    store.record('test-sentinel', makeFindings(2)); // run 2
    store.record('test-sentinel', makeFindings(2)); // run 3 (baseline avg=2)
    const c = store.compare('test-sentinel', makeFindings(6)); // 6/2 = 3x → 升级
    expect(c.deviation.findingCountRatio).toBe(3);
    expect(c.escalatedFindings[0].severity).toBe('critical');
  });

  it('Given 基线未就绪 → 不升级', () => {
    const store = getBaselineStore();
    store.record('test-sentinel', makeFindings(2));
    const c = store.compare('test-sentinel', makeFindings(10));
    expect(c.deviation.findingCountRatio).toBe(5);
    expect(c.escalatedFindings[0].severity).toBe('warning'); // 未升级
  });

  it('Given 空历史 → getBaseline 返回零值', () => {
    const b = getBaselineStore().getBaseline('nonexistent');
    expect(b.totalRuns).toBe(0);
    expect(b.baselineReady).toBe(false);
  });

  it('Given getBaselineStore → 单例复用', () => {
    const s1 = getBaselineStore();
    const s2 = getBaselineStore();
    expect(s1).toBe(s2);
  });
});
