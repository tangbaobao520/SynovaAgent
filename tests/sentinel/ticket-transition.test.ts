/**
 * tests/sentinel/ticket-transition.test.ts — D580 8-4: 工单状态机迁移（runner.transitionTicket）
 *
 * 契约（铁律 47/48, spec §5.4）:
 *   白名单: open→acknowledged | open→dismissed | acknowledged→resolved; 其余一律 ILLEGAL_TRANSITION
 *     （含终态再迁移、同态迁移 — Linear/GitHub 状态机实证, 无后门）。
 *   resolved_at 语义: 仅 'resolved' 写 datetime('now'); dismissed 保持 NULL（列名语义纯度, 裁决表第 4 行）。
 *   审计: 迁移成功 → sentinel_events 追加 ticket_transition（from/to 在 payload）; 非法迁移不写事件。
 *   分类返回: TICKET_NOT_FOUND / ILLEGAL_TRANSITION(from,to) / degraded — 不抛, HTTP 映射在 L1。
 *
 * 模式: better-sqlite3 :memory: + 自建 sentinel_tickets DDL（对齐 D466）; sentinel_events 由
 *   appendSentinelEvent 幂等自建（表不存在 → 建表重试一次, sentinel-events.ts L119-140）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { SentinelRunner } from '../../src/sentinel/runner';
import { createSentinelEventsTable } from '../../src/sentinel/sentinel-events';
import type { CronScheduler } from '../../src/cron/scheduler';

const { logMock } = vi.hoisted(() => ({
  logMock: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() },
}));
vi.mock('@synova/logger', () => ({ logger: logMock, createLogger: vi.fn(() => logMock) }));

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

function makeRunner(db: unknown): SentinelRunner {
  return new SentinelRunner({} as unknown as CronScheduler, db);
}

describe('D580 8-4 — transitionTicket 状态机（L3）', () => {
  let db: Database.Database;
  let runner: SentinelRunner;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(TICKET_DDL);
    createSentinelEventsTable(db); // 审计事件查询前置建表（生产由 start()/appendSentinelEvent 自建）
    logMock.warn.mockClear();
    runner = makeRunner(db);
  });
  afterEach(() => {
    db.close();
  });

  function insertTicket(id: string, status: string): void {
    db.prepare(
      `INSERT INTO sentinel_tickets (id, signal_id, severity, expert_type, diagnosis, suggested_actions, status, created_at, resolved_at)
       VALUES (?, ?, 'critical', 'auto', ?, null, ?, datetime('now'), null)`,
    ).run(id, 'sig_demo', JSON.stringify({ title: '现金流危急' }), status);
  }

  function eventsOf(ticketId: string): Array<{ event_type: string; aggregate_id: string; payload: string }> {
    return db.prepare(
      `SELECT event_type, aggregate_id, payload FROM sentinel_events
       WHERE event_type = 'ticket_transition' AND aggregate_id = ? ORDER BY seq`,
    ).all(ticketId) as Array<{ event_type: string; aggregate_id: string; payload: string }>;
  }

  // ═══ 合法迁移（3 条白名单边, 200 形状 = ok:true + 迁移后行） ═══

  it('open → acknowledged: 状态落表 + resolved_at 保持 NULL + 审计事件', () => {
    insertTicket('t1', 'open');
    const res = runner.transitionTicket('t1', 'acknowledged');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.ticket.id).toBe('t1');
      expect(res.ticket.status).toBe('acknowledged');
      expect(res.ticket.resolved_at).toBeNull();
    }
    const row = db.prepare('SELECT status, resolved_at FROM sentinel_tickets WHERE id = ?').get('t1') as { status: string; resolved_at: string | null };
    expect(row.status).toBe('acknowledged');
    expect(row.resolved_at).toBeNull();

    const evts = eventsOf('t1');
    expect(evts).toHaveLength(1);
    const payload = JSON.parse(evts[0].payload) as { from: string; to: string; ticketId: string };
    expect(payload).toMatchObject({ from: 'open', to: 'acknowledged', ticketId: 't1' });
  });

  it('acknowledged → resolved: resolved_at 写入（仅 resolved 写 — 裁决表第 4 行）', () => {
    insertTicket('t2', 'acknowledged');
    const res = runner.transitionTicket('t2', 'resolved');
    expect(res.ok).toBe(true);
    const row = db.prepare('SELECT status, resolved_at FROM sentinel_tickets WHERE id = ?').get('t2') as { status: string; resolved_at: string | null };
    expect(row.status).toBe('resolved');
    expect(row.resolved_at).toBeTruthy(); // datetime('now') 格式
    const payload = JSON.parse(eventsOf('t2')[0].payload) as { from: string; to: string };
    expect(payload).toMatchObject({ from: 'acknowledged', to: 'resolved' });
  });

  it('open → dismissed: 状态落表 + resolved_at 保持 NULL（dismissed 不写 resolved_at）', () => {
    insertTicket('t3', 'open');
    const res = runner.transitionTicket('t3', 'dismissed');
    expect(res.ok).toBe(true);
    const row = db.prepare('SELECT status, resolved_at FROM sentinel_tickets WHERE id = ?').get('t3') as { status: string; resolved_at: string | null };
    expect(row.status).toBe('dismissed');
    expect(row.resolved_at).toBeNull();
  });

  // ═══ 非法迁移（白名单外一律 ILLEGAL_TRANSITION, 含终态/同态 — 无后门） ═══

  it('acknowledged → dismissed: ILLEGAL_TRANSITION + from/to 字段', () => {
    insertTicket('t4', 'acknowledged');
    const res = runner.transitionTicket('t4', 'dismissed');
    expect(res).toMatchObject({ ok: false, error: 'ILLEGAL_TRANSITION', from: 'acknowledged', to: 'dismissed' });
    expect(eventsOf('t4')).toHaveLength(0); // 非法迁移不写审计事件
  });

  it('终态拒绝: resolved → acknowledged / resolved → dismissed; dismissed → acknowledged', () => {
    insertTicket('t5', 'resolved');
    expect(runner.transitionTicket('t5', 'acknowledged'))
      .toMatchObject({ ok: false, error: 'ILLEGAL_TRANSITION', from: 'resolved', to: 'acknowledged' });
    expect(runner.transitionTicket('t5', 'dismissed'))
      .toMatchObject({ ok: false, error: 'ILLEGAL_TRANSITION', from: 'resolved', to: 'dismissed' });
    insertTicket('t6', 'dismissed');
    expect(runner.transitionTicket('t6', 'acknowledged'))
      .toMatchObject({ ok: false, error: 'ILLEGAL_TRANSITION', from: 'dismissed', to: 'acknowledged' });
    // 终态行内容不变
    expect((db.prepare('SELECT status FROM sentinel_tickets WHERE id = ?').get('t5') as { status: string }).status).toBe('resolved');
  });

  it('同态迁移亦 ILLEGAL（acknowledged → acknowledged, 409 语义）', () => {
    insertTicket('t7', 'acknowledged');
    expect(runner.transitionTicket('t7', 'acknowledged'))
      .toMatchObject({ ok: false, error: 'ILLEGAL_TRANSITION', from: 'acknowledged', to: 'acknowledged' });
  });

  it('未知 id → TICKET_NOT_FOUND', () => {
    expect(runner.transitionTicket('no-such-ticket', 'acknowledged'))
      .toEqual({ ok: false, error: 'TICKET_NOT_FOUND' });
  });

  // ═══ 降级路径（铁律 24/31: db 失败 → degraded 分类返回, 不抛不静默） ═══

  it('db 失败 → { ok:false, degraded:true } + log.warn（不抛, HTTP 503 映射在 L1）', () => {
    const throwingRunner = makeRunner({ prepare: () => { throw new Error('db gone'); } });
    const res = throwingRunner.transitionTicket('t1', 'acknowledged');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.degraded).toBe(true);
      expect(typeof res.error).toBe('string');
    }
    expect(logMock.warn.mock.calls.map((c) => c.map(String).join(' ')).join('\n'))
      .toContain('transitionTicket');
  });
});
