/**
 * tests/sentinel/sentinel-events.test.ts — D394 哨兵 findings 事件化（片 1）
 *
 * 覆盖（≥12 用例，铁律 48 非空壳）:
 *   - sentinel-events.ts 存储: 建表 / seq 单调 / 空表重放 / db 不可用 fail-closed
 *   - I1 可重建: run+finding 事件 → 重放 → records 等价；kill -9 模拟（新 db 实例重放）
 *   - I2 单源: 读路径 getRecentResults 只读投影
 *   - I3 可审计: finding 经 aggregate_id 追溯 run_completed
 *   - durationMs bug: getSentinelFindings checkedAt = run.result.checkedAt（非 1970）
 *   - findings 生命周期: 默认 status=open + finding_transition 迁移 + 重放一致
 *   - DS6 接线: executeSentinel 写 run_completed/finding 事件
 *   - seq 单调无洞: SQL COUNT(*)=MAX(seq) 且 MIN(seq)=1
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { join } from 'path';
import { tmpdir } from 'os';
import { rmSync } from 'fs';
import {
  createSentinelEventsTable,
  appendSentinelEvent,
  replaySentinelEvents,
  SentinelsEventError,
  type SentinelEventInput,
} from '../../src/sentinel/sentinel-events';
import { SentinelRunner, setGlobalSentinelRunner } from '../../src/sentinel/runner';
import { getSentinelRegistry, destroySentinelRegistry } from '../../src/sentinel/registry';
import { getSentinelFindings } from '../../src/agent/sentinel-service';
import { CronScheduler } from '../../src/cron/scheduler';
import type { SentinelFinding, SentinelCheckResult } from '../../src/sentinel/types';

// ═══ Fixtures ═══

const CHECKED_AT = '2026-08-16T10:00:00.000Z';

function makeFinding(overrides: Partial<SentinelFinding> = {}): SentinelFinding {
  return {
    id: 'f1',
    severity: 'warning',
    title: '测试发现',
    description: '测试描述',
    evidence: [],
    suggestion: '建议',
    detectedAt: CHECKED_AT,
    ...overrides,
  };
}

function runCompletedEvent(sentinelId: string, checkedAt: string): SentinelEventInput {
  return {
    event_type: 'run_completed',
    sentinel_id: sentinelId,
    aggregate_id: `${sentinelId}@${checkedAt}`,
    payload: {
      sentinelId,
      sentinelName: sentinelId,
      checkedAt,
      durationMs: 15,
      ok: true,
      cronJobId: 'job-1',
    },
  };
}

function findingEvent(sentinelId: string, checkedAt: string, finding: SentinelFinding): SentinelEventInput {
  return {
    event_type: 'finding',
    sentinel_id: sentinelId,
    aggregate_id: `${sentinelId}@${checkedAt}`,
    payload: { finding },
  };
}

// ═══ Setup ═══

let db: Database.Database;
let scheduler: CronScheduler;
let runner: SentinelRunner;

beforeEach(() => {
  db = new Database(':memory:');
  scheduler = new CronScheduler(db);
  runner = new SentinelRunner(scheduler, db);
  createSentinelEventsTable(db);
});

afterEach(() => {
  setGlobalSentinelRunner(null);
  destroySentinelRegistry();
  scheduler.stop();
  db.close();
});

// ═══ Tests ═══

describe('sentinel-events 存储 (L5 append-only)', () => {
  it('createSentinelEventsTable 建表 → sentinel_events 存在 + seq 主键', () => {
    const tables = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='sentinel_events'`
    ).all();
    expect(tables).toHaveLength(1);

    const cols = db.prepare(`PRAGMA table_info(sentinel_events)`).all() as Array<{ name: string; pk: number }>;
    const seq = cols.find(c => c.name === 'seq');
    expect(seq).toBeDefined();
    expect(seq!.pk).toBe(1);
  });

  it('appendSentinelEvent seq 单调递增（第 2 条 seq=2）', () => {
    appendSentinelEvent(db, runCompletedEvent('s1', CHECKED_AT));
    appendSentinelEvent(db, findingEvent('s1', CHECKED_AT, makeFinding({ id: 'f2' })));
    const rows = replaySentinelEvents(db);
    expect(rows).toHaveLength(2);
    expect(rows[0].seq).toBe(1);
    expect(rows[1].seq).toBe(2);
  });

  it('seq 单调无洞: COUNT(*)=MAX(seq) 且 MIN(seq)=1（SQL 可验）', () => {
    appendSentinelEvent(db, runCompletedEvent('s1', CHECKED_AT));
    appendSentinelEvent(db, findingEvent('s1', CHECKED_AT, makeFinding()));
    appendSentinelEvent(db, findingEvent('s1', CHECKED_AT, makeFinding({ id: 'f3' })));
    const row = db.prepare(
      `SELECT COUNT(*) AS c, MAX(seq) AS mx, MIN(seq) AS mn FROM sentinel_events`
    ).get() as { c: number; mx: number; mn: number };
    expect(row.c).toBe(row.mx);
    expect(row.mn).toBe(1);
  });

  it('边界: 空事件表 → replaySentinelEvents 返回空（不抛）', () => {
    expect(replaySentinelEvents(db)).toEqual([]);
    runner.rebuildFromEvents();
    expect(runner.getRecentResults().size).toBe(0);
  });

  it('appendSentinelEvent db 不可用 → 抛 SentinelsEventError（fail-closed，不静默）', () => {
    const closedDb = new Database(':memory:');
    closedDb.close();
    expect(() => appendSentinelEvent(closedDb, runCompletedEvent('s1', CHECKED_AT)))
      .toThrow(SentinelsEventError);
  });

  it('appendSentinelEvent 表不存在 → 幂等建表后重试成功', () => {
    const freshDb = new Database(':memory:');
    try {
      // 不先建表，直接 append —— 内部应幂等建表后写入
      appendSentinelEvent(freshDb, runCompletedEvent('s1', CHECKED_AT));
      const rows = replaySentinelEvents(freshDb);
      expect(rows).toHaveLength(1);
    } finally {
      freshDb.close();
    }
  });
});

describe('I1 可重建 / I2 单源 / I3 可审计', () => {
  it('I1: 写 run+finding 事件 → 重放 → records 与写入前等价', () => {
    appendSentinelEvent(db, runCompletedEvent('s1', CHECKED_AT));
    appendSentinelEvent(db, findingEvent('s1', CHECKED_AT, makeFinding({ id: 'f1', title: '发现1' })));
    appendSentinelEvent(db, findingEvent('s1', CHECKED_AT, makeFinding({ id: 'f2', severity: 'critical' })));

    runner.rebuildFromEvents();
    const runs = runner.getRecentResults().get('s1');
    expect(runs).toHaveLength(1);
    expect(runs![0].result.checkedAt).toBe(CHECKED_AT);
    expect(runs![0].result.durationMs).toBe(15);
    expect(runs![0].result.findings).toHaveLength(2);
    expect(runs![0].result.findings.map(f => f.id)).toEqual(['f1', 'f2']);
  });

  it('I1 kill -9 模拟: 新 db 实例重放旧事件流 → findings 与崩溃前一致', () => {
    const tmpPath = join(tmpdir(), `synova-events-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    const db1 = new Database(tmpPath);
    try {
      createSentinelEventsTable(db1);
      appendSentinelEvent(db1, runCompletedEvent('s1', CHECKED_AT));
      appendSentinelEvent(db1, findingEvent('s1', CHECKED_AT, makeFinding({ id: 'f1', title: '崩溃前发现' })));
      db1.close();

      // 重启: 新 db 实例读同一持久化文件
      const db2 = new Database(tmpPath);
      const sched2 = new CronScheduler(db2);
      try {
        const runner2 = new SentinelRunner(sched2, db2);
        runner2.rebuildFromEvents();
        const runs = runner2.getRecentResults().get('s1');
        expect(runs).toHaveLength(1);
        expect(runs![0].result.findings).toHaveLength(1);
        expect(runs![0].result.findings[0].title).toBe('崩溃前发现');
        expect(runs![0].result.findings[0].id).toBe('f1');
      } finally {
        sched2.stop();
        db2.close();
      }
    } finally {
      rmSync(tmpPath, { force: true });
    }
  });

  it('I2 单源: 读路径 getRecentResults 只读投影（records），数据来自事件流重放', () => {
    appendSentinelEvent(db, runCompletedEvent('s1', CHECKED_AT));
    appendSentinelEvent(db, findingEvent('s1', CHECKED_AT, makeFinding()));
    runner.rebuildFromEvents();
    const projection = runner.getRecentResults();
    expect(projection.get('s1')).toHaveLength(1);
    expect(projection.get('s1')![0].result.findings).toHaveLength(1);
  });

  it('I3 可审计: 任一 finding 经 aggregate_id 追溯到 run_completed 事件（seq 链完整）', () => {
    const runKey = `s1@${CHECKED_AT}`;
    appendSentinelEvent(db, runCompletedEvent('s1', CHECKED_AT));
    appendSentinelEvent(db, findingEvent('s1', CHECKED_AT, makeFinding({ id: 'f1' })));
    const rows = replaySentinelEvents(db);

    const findingRow = rows.find(
      r => r.event_type === 'finding' && (r.payload.finding as SentinelFinding).id === 'f1'
    );
    expect(findingRow).toBeDefined();
    expect(findingRow!.aggregate_id).toBe(runKey);

    const runRow = rows.find(r => r.event_type === 'run_completed' && r.aggregate_id === runKey);
    expect(runRow).toBeDefined();
    expect(runRow!.seq).toBeLessThan(findingRow!.seq);
  });
});

describe('findings 生命周期 (K3 §4.6) + durationMs bug (DS7)', () => {
  it('executeSentinel 写 run_completed/finding 事件 + 新 finding 默认 status=open (DS6/DS8)', async () => {
    const registry = getSentinelRegistry();
    registry.register({
      config: {
        id: 's1', name: 's1', description: '', category: 'growth', priority: 'P1',
        mode: 'on-demand', version: '1', requiredDataSources: [],
      },
      async check(): Promise<SentinelCheckResult> {
        return { sentinelId: 's1', ok: true, findings: [makeFinding({ id: 'f1' })], durationMs: 1 };
      },
    });

    const result = await runner.runOnce('s1');
    expect(result).not.toBeNull();
    expect(result!.findings[0].status).toBe('open');

    const rows = replaySentinelEvents(db);
    expect(rows.some(r => r.event_type === 'run_completed')).toBe(true);
    expect(rows.some(r => r.event_type === 'finding')).toBe(true);

    // 重放后 records 与运行期等价（含 status=open）
    runner.rebuildFromEvents();
    const runs = runner.getRecentResults().get('s1');
    expect(runs![0].result.findings[0].status).toBe('open');
  });

  it('findings 状态迁移: open→resolved 写 finding_transition + 重放后 status 一致', () => {
    appendSentinelEvent(db, runCompletedEvent('s1', CHECKED_AT));
    appendSentinelEvent(db, findingEvent('s1', CHECKED_AT, makeFinding({ id: 'f1', status: 'open' })));
    runner.rebuildFromEvents();

    const changed = runner.transitionFindingStatus('f1', 'resolved');
    expect(changed).toBe(1);
    expect(runner.getRecentResults().get('s1')![0].result.findings[0].status).toBe('resolved');

    const rows = replaySentinelEvents(db);
    const transition = rows.find(r => r.event_type === 'finding_transition');
    expect(transition).toBeDefined();
    expect(transition!.payload.from).toBe('open');
    expect(transition!.payload.to).toBe('resolved');

    // 重放后 status 迁移链重建（resolved 保持）
    runner.rebuildFromEvents();
    expect(runner.getRecentResults().get('s1')![0].result.findings[0].status).toBe('resolved');
  });

  it('transitionFindingStatus 未命中 finding → 返回 0（边界）', () => {
    appendSentinelEvent(db, runCompletedEvent('s1', CHECKED_AT));
    appendSentinelEvent(db, findingEvent('s1', CHECKED_AT, makeFinding({ id: 'f1' })));
    runner.rebuildFromEvents();
    expect(runner.transitionFindingStatus('nonexistent', 'resolved')).toBe(0);
  });

  it('durationMs bug: getSentinelFindings checkedAt = run.result.checkedAt（非 1970）', () => {
    appendSentinelEvent(db, runCompletedEvent('s1', CHECKED_AT));
    appendSentinelEvent(db, findingEvent('s1', CHECKED_AT, makeFinding({ id: 'f1' })));
    runner.rebuildFromEvents();
    setGlobalSentinelRunner(runner);

    const res = getSentinelFindings();
    expect(res.ok).toBe(true);
    expect(res.findings).toHaveLength(1);
    expect(res.findings[0].checkedAt).toBe(CHECKED_AT);
    expect(res.findings[0].checkedAt).not.toContain('1970');
  });
});
