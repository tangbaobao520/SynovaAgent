/**
 * tests/sentinel/sentinel-runner-auto-ticket.test.ts — D466 告警闭环：critical/emergency 信号自动建工单
 *
 * 契约（选项 A，创始人 2026-08-21 批准）: dispatchSignalsToExperts 对 critical/emergency 信号
 *   按严重度自动 INSERT OR REPLACE sentinel_tickets（不依赖 ExpertDispatcher/LLM）；
 *   同信号重复触发 → 幂等（行数不增，去重键稳定）；warning 信号不建工单。
 * 铁律 48: 正常（critical → 工单）/ 边界（warning → 不建；重复触发幂等）+ expect 断言。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { SentinelRunner } from '../../src/sentinel/runner';
import type { Sentinel, SentinelFinding, SentinelCheckResult } from '../../src/sentinel/types';
import type { CronScheduler } from '../../src/cron/cron-scheduler';

// 运行记录注入（绕过私有 records）：通过 runOnce + 假 registry
const fakeSentinels = new Map<string, Sentinel>();

vi.mock('../../src/sentinel/registry', () => ({
  getSentinelRegistry: () => ({
    get: (id: string) => fakeSentinels.get(id),
  }),
  destroySentinelRegistry: () => {},
}));

function makeFinding(overrides: Partial<SentinelFinding> = {}): SentinelFinding {
  return {
    id: 'f1', severity: 'critical', title: '现金流危急', description: '跑道0.3个月 < 6个月',
    evidence: ['总现金: 30000'], suggestion: '启动应急融资', detectedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeSentinel(id: string, findings: SentinelFinding[]): Sentinel {
  return {
    config: { id, name: id, description: '', category: 'growth', priority: 'P1', mode: 'manual', version: '1', requiredDataSources: [] },
    async check(_ctx): Promise<SentinelCheckResult> {
      return { sentinelId: id, ok: true, findings, durationMs: 1, checkedAt: new Date().toISOString() };
    },
  };
}

/** 与 runner.start() 相同的工单表 DDL（测试自建，不依赖 start 的 cron 副作用） */
const TICKET_DDL = `CREATE TABLE IF NOT EXISTS sentinel_tickets (
  id TEXT PRIMARY KEY,
  signal_id TEXT NOT NULL,
  severity TEXT NOT NULL,
  expert_type TEXT NOT NULL,
  diagnosis TEXT,
  suggested_actions TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
)`;

describe('SentinelRunner — D466 自动工单（告警闭环不依赖专家）', () => {
  let db: Database.Database;
  let runner: SentinelRunner;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(TICKET_DDL);
    fakeSentinels.clear();
    runner = new SentinelRunner({} as unknown as CronScheduler, db);
  });

  afterEach(() => {
    db.close();
  });

  function ticketCount(): number {
    return (db.prepare('SELECT COUNT(*) AS c FROM sentinel_tickets').get() as { c: number }).c;
  }

  it('正常路径：critical 信号 → 自动建工单（无 ExpertDispatcher 也闭环）', async () => {
    fakeSentinels.set('sentinel-cash-runway', makeSentinel('sentinel-cash-runway', [makeFinding()]));
    const result = await runner.runOnce('sentinel-cash-runway');
    expect(result).not.toBeNull();

    await runner.aggregateAndDispatch();

    expect(ticketCount()).toBe(1);
    const row = db.prepare('SELECT * FROM sentinel_tickets').get() as { severity: string; expert_type: string; diagnosis: string };
    expect(row.severity).toBe('critical');
    expect(row.expert_type).toBe('auto');
    expect(row.diagnosis).toContain('现金流危急');
  });

  it('边界路径：warning 信号 → 不建工单（降级提示 ≠ 工单）', async () => {
    fakeSentinels.set('sentinel-cash-runway', makeSentinel('sentinel-cash-runway', [makeFinding({ severity: 'warning', title: '数据不完整' })]));
    await runner.runOnce('sentinel-cash-runway');
    await runner.aggregateAndDispatch();
    expect(ticketCount()).toBe(0);
  });

  it('边界路径：同信号重复触发 → INSERT OR REPLACE 幂等（去重键稳定，行数不增）', async () => {
    fakeSentinels.set('sentinel-cash-runway', makeSentinel('sentinel-cash-runway', [makeFinding()]));
    await runner.runOnce('sentinel-cash-runway');
    await runner.aggregateAndDispatch();
    expect(ticketCount()).toBe(1);

    // 二次触发（同窗口内）→ 行数不增
    await runner.runOnce('sentinel-cash-runway');
    await runner.aggregateAndDispatch();
    expect(ticketCount()).toBe(1);
  });
});
