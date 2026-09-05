/**
 * tests/routes/sentinel-tickets.test.ts — D580 8-2/8-4: 工单 API 真实 router 接线（L2a, 铁律 12）
 *
 * 契约（spec §5.2/§5.4 L1 映射）:
 *   GET /api/sentinel/tickets[?status=] — 200 表读同源: source:'table' | 'memory-fallback'（+ degraded:true）;
 *     status 过滤在表 SQL 与内存 fallback 两条路径都真实生效（routes L91 死变量修复的物理证明）。
 *   POST /api/sentinel/tickets/:id/transition — 200 合法迁移 / 400 缺 to 或 to 非法枚举 /
 *     404 TICKET_NOT_FOUND / 409 ILLEGAL_TRANSITION(from,to) / 503 db 不可用（degraded:true）。
 *
 * 接线: 真实 router（src/routes/sentinel.ts）+ 真实 express http server + 真实 service → 真实 runner
 *   （:memory: SQLite）— 不 mock 管线（铁律 12）; 仅 notifications dispatch 打桩（观测点）。
 * 场景覆盖: DS6-① critical 注入 → 工单落表 GET 可见; DS6-③ acknowledge→resolve 全链路 + GET 反映终态。
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import Database from 'better-sqlite3';
import sentinelRouter from '../../src/routes/sentinel';
import { SentinelRunner, setGlobalSentinelRunner } from '../../src/sentinel/runner';
import { getSentinelRegistry, destroySentinelRegistry } from '../../src/sentinel/registry';
import type { Sentinel, SentinelFinding, SentinelCheckResult } from '../../src/sentinel/types';
import type { CronScheduler } from '../../src/cron/scheduler';

const { dispatchNotificationMock } = vi.hoisted(() => ({
  dispatchNotificationMock: vi.fn(async () => ({ results: [], degraded: false })),
}));
vi.mock('../../src/notifications/registry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/notifications/registry')>()),
  dispatchNotification: dispatchNotificationMock,
}));

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
const DEDUP_DDL = `CREATE TABLE IF NOT EXISTS sentinel_notification_dedup (
  key TEXT PRIMARY KEY,
  last_sent_ms INTEGER NOT NULL
)`;

function makeFinding(overrides: Partial<SentinelFinding> = {}): SentinelFinding {
  return {
    id: 'f1', severity: 'critical', title: '团队A: 现金流危急', description: '跑道 0.3 个月',
    evidence: [], suggestion: '应急融资', detectedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeSentinel(id: string, findings: SentinelFinding[]): Sentinel {
  return {
    config: {
      id, name: id, description: '', category: 'growth', priority: 'P1', mode: 'manual',
      version: '1', requiredDataSources: [], confidenceModel: 'deterministic',
    },
    async check(_context): Promise<SentinelCheckResult> {
      return { sentinelId: id, ok: true, findings, durationMs: 0, checkedAt: new Date().toISOString() };
    },
  };
}

describe('D580 — /api/sentinel/tickets 真实接线（GET 双源 + POST transition 五映射）', () => {
  let db: Database.Database;
  let runner: SentinelRunner;
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/sentinel', sentinelRouter);
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });
  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(TICKET_DDL);
    db.exec(DEDUP_DDL);
    destroySentinelRegistry();
    dispatchNotificationMock.mockClear();
    runner = new SentinelRunner({} as unknown as CronScheduler, db);
    setGlobalSentinelRunner(runner);
  });
  afterEach(() => {
    setGlobalSentinelRunner(null);
    db.close();
  });

  async function GET(path: string): Promise<{ status: number; body: Record<string, unknown> }> {
    const res = await fetch(`${baseUrl}${path}`);
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }

  async function POST(path: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
    const res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }

  function ticketCount(): number {
    return (db.prepare('SELECT COUNT(*) AS c FROM sentinel_tickets').get() as { c: number }).c;
  }

  // ═══ GET /tickets — 表读同源 ═══

  it('DS6 场景①: critical 注入 → 自动工单落表 → GET 可见（source:table, status 字段在场）', async () => {
    getSentinelRegistry().register(makeSentinel('sentinel-cash-runway', [makeFinding()]));
    await runner.runOnce('sentinel-cash-runway');
    await runner.aggregateAndDispatch();
    expect(ticketCount()).toBe(1); // 写路径落表（写读同源的"写"侧）

    const res = await GET('/api/sentinel/tickets');
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('table');
    expect(res.body.degraded).toBeUndefined();
    const tickets = res.body.tickets as Array<Record<string, unknown>>;
    expect(tickets).toHaveLength(1);
    expect(tickets[0]).toMatchObject({
      status: 'open',
      severity: 'critical',
      // diagnosis JSON title 派生 — auto 工单的 diagnosis.title = 聚合信号 title（createAutoTicket L726 先例）
      title: '1 个哨兵同时指向: 团队A',
    });
    expect(String(tickets[0].id)).toContain('auto');
  });

  it('GET ?status= 过滤真实生效（表路径, 死变量修复的物理证明）', async () => {
    db.prepare(
      `INSERT INTO sentinel_tickets (id, signal_id, severity, expert_type, diagnosis, suggested_actions, status, created_at, resolved_at)
       VALUES ('ticket-a', 'sig_demo', 'critical', 'auto', ?, null, 'open', datetime('now'), null),
              ('ticket-b', 'sig_demo2', 'critical', 'auto', ?, null, 'resolved', datetime('now'), datetime('now'))`,
    ).run(JSON.stringify({ title: '工单A' }), JSON.stringify({ title: '工单B' }));

    const open = await GET('/api/sentinel/tickets?status=open');
    expect((open.body.tickets as unknown[]).map((t) => (t as { id: string }).id)).toEqual(['ticket-a']);

    const resolved = await GET('/api/sentinel/tickets?status=resolved');
    expect((resolved.body.tickets as unknown[]).map((t) => (t as { id: string }).id)).toEqual(['ticket-b']);

    const all = await GET('/api/sentinel/tickets');
    expect(all.body.tickets).toHaveLength(2);
  });

  it('空表 → 200 + memory-fallback + degraded:true（内存兜底路径 status 过滤同样生效）', async () => {
    getSentinelRegistry().register(makeSentinel('sentinel-cash-runway', [makeFinding()]));
    await runner.runOnce('sentinel-cash-runway'); // 内存投影有 finding, 表 0 行

    const res = await GET('/api/sentinel/tickets');
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('memory-fallback');
    expect(res.body.degraded).toBe(true);
    expect((res.body.tickets as unknown[]).length).toBeGreaterThanOrEqual(1);

    // fallback 路径的 status 过滤（内存派生项 = open 语义）
    const open = await GET('/api/sentinel/tickets?status=open');
    expect((open.body.tickets as unknown[]).length).toBeGreaterThanOrEqual(1);
    const gone = await GET('/api/sentinel/tickets?status=resolved');
    expect(gone.body.tickets).toEqual([]);
  });

  it('db 句柄损坏 → 200 + memory-fallback + degraded:true（L2 统一降级, L1 不 500）', async () => {
    const brokenRunner = new SentinelRunner(
      {} as unknown as CronScheduler,
      { prepare: () => { throw new Error('db handle corrupted'); } },
    );
    setGlobalSentinelRunner(brokenRunner);
    getSentinelRegistry().register(makeSentinel('sentinel-cash-runway', [makeFinding()]));
    await brokenRunner.runOnce('sentinel-cash-runway');

    const res = await GET('/api/sentinel/tickets');
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('memory-fallback');
    expect(res.body.degraded).toBe(true);
  });

  // ═══ POST /tickets/:id/transition — 五映射 ═══

  function insertTicket(id: string, status: string): void {
    db.prepare(
      `INSERT INTO sentinel_tickets (id, signal_id, severity, expert_type, diagnosis, suggested_actions, status, created_at, resolved_at)
       VALUES (?, 'sig_demo', 'critical', 'auto', ?, null, ?, datetime('now'), null)`,
    ).run(id, JSON.stringify({ title: '现金流危急' }), status);
  }

  it('DS6 场景③: acknowledge → resolve 全链路 200, GET 反映终态', async () => {
    getSentinelRegistry().register(makeSentinel('sentinel-cash-runway', [makeFinding()]));
    await runner.runOnce('sentinel-cash-runway');
    await runner.aggregateAndDispatch();
    const ticketId = (db.prepare('SELECT id FROM sentinel_tickets').get() as { id: string }).id;

    const ack = await POST(`/api/sentinel/tickets/${encodeURIComponent(ticketId)}/transition`, { to: 'acknowledged' });
    expect(ack.status).toBe(200);
    expect(ack.body).toMatchObject({ ok: true });
    expect((ack.body.ticket as { status: string }).status).toBe('acknowledged');

    const resolve = await POST(`/api/sentinel/tickets/${encodeURIComponent(ticketId)}/transition`, { to: 'resolved' });
    expect(resolve.status).toBe(200);
    expect((resolve.body.ticket as { status: string }).status).toBe('resolved');
    // L2 原样传播 runner 行（TicketRow snake_case）; GET 视图才是 camelCase resolvedAt
    expect((resolve.body.ticket as { resolved_at?: string }).resolved_at).toBeTruthy();

    // GET 反映终态: resolved 可见, open 不可见
    const resolved = await GET('/api/sentinel/tickets?status=resolved');
    expect((resolved.body.tickets as Array<{ id: string }>).map((t) => t.id)).toContain(ticketId);
    const open = await GET('/api/sentinel/tickets?status=open');
    expect((open.body.tickets as Array<{ id: string }>).map((t) => t.id)).not.toContain(ticketId);
  });

  it('非法迁移 → 409 + from/to（白名单外无后门）', async () => {
    insertTicket('ticket-x', 'acknowledged');
    const res = await POST('/api/sentinel/tickets/ticket-x/transition', { to: 'dismissed' });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ ok: false, error: 'ILLEGAL_TRANSITION', from: 'acknowledged', to: 'dismissed' });
  });

  it('未知工单 → 404 TICKET_NOT_FOUND', async () => {
    const res = await POST('/api/sentinel/tickets/no-such-ticket/transition', { to: 'acknowledged' });
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ ok: false, error: 'TICKET_NOT_FOUND' });
  });

  it('body 缺 to → 400; to 非法枚举 → 400（INVALID_TARGET）', async () => {
    insertTicket('ticket-y', 'open');
    const missing = await POST('/api/sentinel/tickets/ticket-y/transition', {});
    expect(missing.status).toBe(400);
    expect(missing.body.ok).toBe(false);

    const invalid = await POST('/api/sentinel/tickets/ticket-y/transition', { to: 'garbage' });
    expect(invalid.status).toBe(400);
    expect(invalid.body).toMatchObject({ ok: false, error: 'INVALID_TARGET' });
  });

  it('db 不可用 → 503 + degraded:true（降级传播链 L3→L2→L1, 铁律 31 全链）', async () => {
    const brokenRunner = new SentinelRunner(
      {} as unknown as CronScheduler,
      { prepare: () => { throw new Error('db gone'); } },
    );
    setGlobalSentinelRunner(brokenRunner);
    const res = await POST('/api/sentinel/tickets/any-ticket/transition', { to: 'acknowledged' });
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ ok: false, degraded: true });
  });
});
