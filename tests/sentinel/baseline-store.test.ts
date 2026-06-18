/** tests/sentinel/baseline-store.test.ts — 基线管理单元测试 */
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
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

// ═══ Week 2: SQLite 持久化 + 可配置阈值 ═══

describe('BaselineStore — SQLite 持久化', () => {
  let db: Database.Database;
  let store: BaselineStore;

  beforeEach(() => {
    db = new Database(':memory:');
    store = new BaselineStore();
    store.setDatabase(db as any);
  });

  it('Given setDatabase 调用 → schema 已创建', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sentinel_baselines'").get();
    expect(tables).toBeTruthy();
  });

  it('Given record 存入 → 数据持久化到 SQLite', () => {
    store.record('test-s', [{ id: 'f1', severity: 'warning' as const, title: 't', description: 'd', detectedAt: new Date().toISOString(), sentinelId: 'test-s', confidence: 0.8 }]);
    const rows = db.prepare('SELECT * FROM sentinel_baselines WHERE sentinel_id=?').all('test-s');
    expect(rows.length).toBe(1);
  });

  it('Given 历史数据在 DB → loadFromDatabase 恢复状态', () => {
    // 模拟历史数据
    db.prepare("INSERT INTO sentinel_baselines (sentinel_id, finding_count, critical_count, warning_count, checked_at) VALUES (?, ?, ?, ?, ?)").run('hist-s', 5, 1, 2, new Date().toISOString());
    db.prepare("INSERT INTO sentinel_baselines (sentinel_id, finding_count, critical_count, warning_count, checked_at) VALUES (?, ?, ?, ?, ?)").run('hist-s', 4, 0, 1, new Date().toISOString());
    // 新 store 从 DB 加载
    const newStore = new BaselineStore();
    newStore.setDatabase(db as any);
    const baseline = newStore.getBaseline('hist-s');
    expect(baseline.totalRuns).toBe(2);
    expect(baseline.avgFindingCount).toBe(4.5);
  });

  it('Given per-sentinel 覆写阈值 → compare 使用覆写值', () => {
    // 建立基线
    store.record('perf-s', [{ id: 'f1', severity: 'warning' as const, title: 't', description: 'd', detectedAt: new Date().toISOString(), sentinelId: 'perf-s', confidence: 0.8 }]);
    store.record('perf-s', [{ id: 'f2', severity: 'warning' as const, title: 't', description: 'd', detectedAt: new Date().toISOString(), sentinelId: 'perf-s', confidence: 0.8 }]);
    store.record('perf-s', [{ id: 'f3', severity: 'warning' as const, title: 't', description: 'd', detectedAt: new Date().toISOString(), sentinelId: 'perf-s', confidence: 0.8 }]);

    // 设置更高的阈值 (5x warning)
    store.updateConfig({ perSentinel: { 'perf-s': { warningRatio: 5.0 } } });
    const result = store.compare('perf-s', [{ id: 'f4', severity: 'warning' as const, title: 't', description: 'd', detectedAt: new Date().toISOString(), sentinelId: 'perf-s', confidence: 0.8 }]);
    // 2x 基线 (1 → 1, ratio=1) 在 5x 阈值内 → 不升级
    expect(result.escalatedFindings[0].severity).toBe('warning');
  });

  it('Given updateConfig → getConfig 返回更新值', () => {
    store.updateConfig({ findingCountRatioWarning: 4.0 });
    expect(store.getConfig().findingCountRatioWarning).toBe(4.0);
    expect(store.getConfig().findingCountRatioCritical).toBe(3.0); // unchanged
  });
});
