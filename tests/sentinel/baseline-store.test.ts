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
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sentinel_alert_stats'").get();
    expect(tables).toBeTruthy();
  });

  it('Given record 存入 → 数据持久化到 SQLite', () => {
    store.record('test-s', [{ id: 'f1', severity: 'warning' as const, title: 't', description: 'd', detectedAt: new Date().toISOString(), sentinelId: 'test-s', confidence: 0.8 }]);
    const rows = db.prepare('SELECT * FROM sentinel_alert_stats WHERE sentinel_id=?').all('test-s');
    expect(rows.length).toBe(1);
  });

  it('Given 历史数据在 DB → loadFromDatabase 恢复状态', () => {
    // 模拟历史数据
    db.prepare("INSERT INTO sentinel_alert_stats (sentinel_id, finding_count, critical_count, warning_count, checked_at) VALUES (?, ?, ?, ?, ?)").run('hist-s', 5, 1, 2, new Date().toISOString());
    db.prepare("INSERT INTO sentinel_alert_stats (sentinel_id, finding_count, critical_count, warning_count, checked_at) VALUES (?, ?, ?, ?, ?)").run('hist-s', 4, 0, 1, new Date().toISOString());
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

// ═══ D967 ④: 表改名 sentinel_baselines → sentinel_alert_stats ═══

describe('D967 ④ — 表改名 + 原地保数据（判别性）', () => {
  /** 造一个"旧库"：只有旧表名 + 2 行历史告警统计 */
  function makeLegacyDb(): Database.Database {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE sentinel_baselines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sentinel_id TEXT NOT NULL,
        finding_count INTEGER NOT NULL DEFAULT 0,
        critical_count INTEGER NOT NULL DEFAULT 0,
        warning_count INTEGER NOT NULL DEFAULT 0,
        checked_at TEXT NOT NULL
      );
      CREATE INDEX idx_sentinel_baselines_sid ON sentinel_baselines(sentinel_id, checked_at);
    `);
    const ins = db.prepare(
      'INSERT INTO sentinel_baselines (sentinel_id, finding_count, critical_count, warning_count, checked_at) VALUES (?, ?, ?, ?, ?)',
    );
    ins.run('legacy-s', 5, 1, 2, '2026-08-01T00:00:00Z');
    ins.run('legacy-s', 3, 0, 1, '2026-09-01T00:00:00Z');
    return db;
  }

  const tableExists = (db: Database.Database, name: string): boolean =>
    Boolean(db.prepare("SELECT 1 AS x FROM sqlite_master WHERE type='table' AND name=?").get(name));

  it('旧表 + 历史数据 → 改名后新表存在、旧表消失、**数据零丢失**', () => {
    const db = makeLegacyDb();
    expect(tableExists(db, 'sentinel_baselines')).toBe(true);

    const store = new BaselineStore();
    store.setDatabase(db as any);

    expect(tableExists(db, 'sentinel_baselines')).toBe(false); // 旧名不再存在
    expect(tableExists(db, 'sentinel_alert_stats')).toBe(true); // 新名存在

    const rows = db.prepare('SELECT * FROM sentinel_alert_stats WHERE sentinel_id=?').all('legacy-s');
    expect(rows).toHaveLength(2); // ← 判别性：只建新表（不改名）会得 0 行

    const stats = store.getBaseline('legacy-s');
    expect(stats.totalRuns).toBe(2);
    expect(stats.avgFindingCount).toBe(4); // (5+3)/2
    db.close();
  });

  it('索引随改名重建为新名（旧名索引不残留）', () => {
    const db = makeLegacyDb();
    const store = new BaselineStore();
    store.setDatabase(db as any);

    const names = (
      db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='sentinel_alert_stats'").all() as Array<{ name: string }>
    ).map((r) => r.name);
    expect(names).toContain('idx_sentinel_alert_stats_sid');
    expect(names).not.toContain('idx_sentinel_baselines_sid');
    db.close();
  });

  it('幂等: 已是新表 → 再 setDatabase 不报错、数据不变', () => {
    const db = makeLegacyDb();
    new BaselineStore().setDatabase(db as any);
    const store2 = new BaselineStore();
    expect(() => store2.setDatabase(db as any)).not.toThrow();
    const n = db.prepare('SELECT COUNT(*) AS n FROM sentinel_alert_stats').get() as { n: number };
    expect(n.n).toBe(2);
    db.close();
  });

  it('全新库: 无旧表 → 直接建新表（不触发改名）', () => {
    const db = new Database(':memory:');
    const store = new BaselineStore();
    store.setDatabase(db as any);
    expect(tableExists(db, 'sentinel_alert_stats')).toBe(true);
    expect(tableExists(db, 'sentinel_baselines')).toBe(false);
    db.close();
  });
});
