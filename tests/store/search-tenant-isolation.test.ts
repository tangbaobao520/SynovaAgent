/**
 * tests/store/search-tenant-isolation.test.ts — D826 租户隔离（穿真实入口）
 *
 * 卡: D826（board task-5）｜规格: .claude/task-briefs/2026-09-20-D826-search-tenant-isolation.md
 * 入口 = 真实 express 路由 `GET /api/sessions/search`（`src/routes/sessions.ts`）
 * 中间 = 真实 `extractAuthFromRequest` + 真实 `SessionStore`（better-sqlite3 `:memory:`，**一个库里放两个租户**）
 * 出口 = HTTP 响应 `results` 只能含**权威租户**的行
 *
 * 身份边界说明（如实标注，勿误读为 mock 管线）:
 *   `/api/sessions` 在 JWT **白名单**内（`src/middleware/auth.ts:124`，D590 裁决① 单机本地信任）
 *   ⇒ 生产中间件在白名单上**早退、不验签**（`:282-284`），`req.auth` 常为空。
 *   ⇒ 本测试用**真实** `verifyJwtToken`（生产中间件在非白名单路径上做的那一步）在测试 app 里显式完成验签，
 *      以驱动 org-A / org-B 两种身份。**JWT 真实签发 + 真实验签；路由 / store / SQL 全真实；未 mock 管线。**
 *
 * red→green: 修复前用例 D826-1/2/3 必红（两条 SQL 都不过滤 → 跨租户命中）；D826-4 必红（`q="` → 500）。
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import Database from 'better-sqlite3';
import { SessionStore } from '../../src/store/session-store';
import { signJwtToken, verifyJwtToken, type JwtPayload } from '../../src/middleware/auth';

// ── 可观测边界替身：日志接收器（断言「客户端尝试选租户」的审计线索）──
const logSink = vi.hoisted(() => ({ warn: [] as Array<Record<string, unknown>> }));
vi.mock('@synova/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@synova/logger')>();
  return {
    ...actual,
    createLogger: () => ({
      info: () => {}, debug: () => {}, trace: () => {}, fatal: () => {},
      warn: (...args: unknown[]) => {
        const fields = typeof args[0] === 'object' && args[0] !== null ? (args[0] as Record<string, unknown>) : {};
        logSink.warn.push(fields);
      },
      error: () => {},
    }),
  };
});

const JWT_SECRET = 'd826-tenant-isolation-test-secret';

interface SearchBody {
  ok?: boolean;
  results?: Array<{ sessionId: string; orgId: string; snippet: string }>;
  count?: number;
  orgId?: string;
  code?: string;
}

describe('D826: search() 租户隔离（穿真实 HTTP 入口）', () => {
  let db: Database.Database;
  let store: SessionStore;
  let app: Server;
  let baseUrl = '';
  /** 第二个 app：**不注入 req.auth**（= 生产白名单路径的真实形态，队长裁定要求独立 app） */
  let appNoAuth: Server;
  let baseUrlNoAuth = '';

  /** 真实签发 JWT（orgId 即租户）；失败即测试自身缺陷 */
  function tokenFor(orgId: string): string {
    const token = signJwtToken({ sub: `user-${orgId}`, role: 'admin', orgId });
    if (!token) throw new Error('JWT 签发失败（JWT_SECRET 未生效）');
    return token;
  }

  async function search(q: string, opts: { orgId?: string; token?: string; queryOrgId?: string } = {}): Promise<{ status: number; body: SearchBody }> {
    const params = new URLSearchParams({ q });
    if (opts.queryOrgId !== undefined) params.set('orgId', opts.queryOrgId);
    const headers: Record<string, string> = {};
    if (opts.token !== undefined) headers['Authorization'] = `Bearer ${opts.token}`;
    const res = await fetch(`${baseUrl}/api/sessions/search?${params.toString()}`, { headers });
    return { status: res.status, body: await res.json() as SearchBody };
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = JWT_SECRET;

    const expressApp = express();
    expressApp.use(express.json());

    // ── 种子数据：**同一个库两个租户**（隔离断言的前提）
    db = new Database(':memory:');
    store = new SessionStore(db);
    const sa = store.createSession('org-A');
    store.addMessage(sa.id, 'user', 'd826markalpha 我们团队协作效率很低，需要复盘');
    store.addMessage(sa.id, 'assistant', 'd826markalpha 收到，先看团队规模');
    const sb = store.createSession('org-B');
    store.addMessage(sb.id, 'user', 'd826markbeta 渠道投放回报明显下滑');
    store.addMessage(sb.id, 'assistant', 'd826markbeta 收到，先看投放结构');
    // 字面短语对照件（注入面用例）：只有 org-A 的消息里含字面 "a OR b"
    const sc = store.createSession('org-A');
    store.addMessage(sc.id, 'user', 'd826markdelta 关键词是 a OR b 这一串字面文本');
    const sd = store.createSession('org-A');
    store.addMessage(sd.id, 'user', 'd826markgamma 只有孤立字符 alpha 出现');

    expressApp.locals.sessionStore = store;
    // 生产中间件在**非白名单路径**上做的事：验签 Bearer → req.auth（JWT 真实校验，非 mock）
    expressApp.use((req, _res, next) => {
      const header = req.headers['authorization'];
      if (typeof header === 'string' && header.startsWith('Bearer ')) {
        const result = verifyJwtToken(header.slice(7).trim());
        if (result.payload) (req as express.Request & { auth?: JwtPayload }).auth = result.payload;
      }
      next();
    });
    const sessionsRouter = (await import('../../src/routes/sessions')).default;
    expressApp.use(sessionsRouter);

    app = expressApp.listen(0);
    await new Promise<void>(resolve => { app.once('listening', () => resolve()); });
    const addr = app.address();
    const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;

    // ── 第二个 app：无任何身份注入（= 白名单路径在生产里的真实形态）
    const expressNoAuth = express();
    expressNoAuth.use(express.json());
    expressNoAuth.locals.sessionStore = store;
    expressNoAuth.use(sessionsRouter);
    appNoAuth = expressNoAuth.listen(0);
    await new Promise<void>(resolve => { appNoAuth.once('listening', () => resolve()); });
    const addrNoAuth = appNoAuth.address();
    const portNoAuth = typeof addrNoAuth === 'object' && addrNoAuth !== null ? addrNoAuth.port : 0;
    baseUrlNoAuth = `http://127.0.0.1:${portNoAuth}`;
  });

  afterAll(async () => {
    await new Promise<void>(resolve => { app.close(() => resolve()); });
    await new Promise<void>(resolve => { appNoAuth.close(() => resolve()); });
    db.close();
  });

  beforeEach(() => { logSink.warn.length = 0; });

  it('D826-1 跨租户不泄露 · 中文词走 LIKE 分支（org-A 搜只在 org-B 存在的词 → 空）', async () => {
    const crossTenant = await search('渠道投放', { token: tokenFor('org-A') });
    expect(crossTenant.status).toBe(200);
    expect(crossTenant.body.results, 'org-A 不得看到 org-B 的「渠道投放」').toEqual([]);

    // 同词对照：org-B 身份必须命中（排除"词根本不存在"的假绿）
    const ownTenant = await search('渠道投放', { token: tokenFor('org-B') });
    expect(ownTenant.status).toBe(200);
    expect(ownTenant.body.results?.length ?? 0).toBeGreaterThanOrEqual(1);
    expect(ownTenant.body.results?.every(r => r.orgId === 'org-B')).toBe(true);
  }, 30_000);

  it('D826-2 跨租户不泄露 · 英文词走 FTS5 分支（两条 SQL 都受约束）', async () => {
    const crossTenant = await search('d826markbeta', { token: tokenFor('org-A') });
    expect(crossTenant.status).toBe(200);
    expect(crossTenant.body.results, 'org-A 不得看到 org-B 的 d826markbeta').toEqual([]);

    const ownTenant = await search('d826markbeta', { token: tokenFor('org-B') });
    expect(ownTenant.status).toBe(200);
    expect(ownTenant.body.results?.length ?? 0).toBeGreaterThanOrEqual(1);
    expect(ownTenant.body.results?.every(r => r.orgId === 'org-B')).toBe(true);

    // 反向覆盖：org-A 搜自己的词仍能命中（不是把结果全过滤掉）
    const selfHit = await search('d826markalpha', { token: tokenFor('org-A') });
    expect(selfHit.body.results?.length ?? 0).toBeGreaterThanOrEqual(1);
    expect(selfHit.body.results?.every(r => r.orgId === 'org-A')).toBe(true);
  }, 30_000);

  it('D826-3 客户端入参不得选租户（?orgId= 一律忽略 + 留审计线索）', async () => {
    const orgBOnlyWord = '渠道投放';
    const withoutParam = await search(orgBOnlyWord, { token: tokenFor('org-A') });
    const withHostileParam = await search(orgBOnlyWord, { token: tokenFor('org-A'), queryOrgId: 'org-B' });

    expect(withHostileParam.status).toBe(200);
    expect(withHostileParam.body.results, '带 ?orgId=org-B 也不得越权拿到 org-B 数据').toEqual([]);
    // 结果恒等于「同一身份、不带该参数」的结果（入参对租户无影响）
    expect(withHostileParam.body.results).toEqual(withoutParam.body.results);
    expect(withHostileParam.body.orgId).toBe('org-A');

    // 审计线索：客户端尝试选租户必须留下 warn（不静默）
    const flagged = logSink.warn.some(w => w.requestedOrgId === 'org-B' && w.authoritativeOrgId === 'org-A');
    expect(flagged, '应记录 requestedOrgId/authoritativeOrgId 审计线索').toBe(true);
  }, 30_000);

  it('D826-4 注入面：非法 MATCH 语法 → 200/400（绝不 500）；`a OR b` 当字面短语', async () => {
    const hostile = ['"', 'a"b', '*', 'alpha AND', 'NEAR(alpha'];
    for (const q of hostile) {
      const res = await search(q, { token: tokenFor('org-A') });
      expect([200, 400], `q=${JSON.stringify(q)} 不得为 500`).toContain(res.status);
    }

    // 字面短语：`a OR b` 只匹配含该字面串的 org-A 消息，不匹配只含 alpha 的那条
    const literal = await search('a OR b', { token: tokenFor('org-A') });
    expect(literal.status).toBe(200);
    const ids = (literal.body.results ?? []).map(r => r.snippet);
    expect(ids.some(s => s.includes('a OR b')), '应命中字面 "a OR b" 的消息').toBe(true);
    expect(ids.some(s => s.includes('只有孤立字符 alpha')), '不得把 OR 当布尔算符误召回').toBe(false);
  }, 30_000);

  it('D826-5 snippet 契约：FTS5 分支保留 <mark>（CLI 依赖，非本卡注入面）', async () => {
    const res = await search('d826markalpha', { token: tokenFor('org-A') });
    expect(res.status).toBe(200);
    const snippets = (res.body.results ?? []).map(r => r.snippet).join('\n');
    expect(snippets).toContain('<mark>');
    // 契约断言（非行为修复）：缺陷态同样会绿 → 不具反向判别力，已如实标注
  }, 30_000);

  it('D826-6 边界：未认证（白名单语义）→ 服务端实例 org，绝不返回全部租户', async () => {
    const prev = process.env.SYNOVA_ORG_ID;
    process.env.SYNOVA_ORG_ID = 'org-A';
    try {
      // 独立 app（无任何身份注入）= 生产白名单路径的真实形态 → 权威 org = 服务端实例 org
      const crossTenant = await fetch(`${baseUrlNoAuth}/api/sessions/search?q=${encodeURIComponent('渠道投放')}`);
      expect(crossTenant.status).toBe(200);
      const crossBody = await crossTenant.json() as SearchBody;
      expect(crossBody.results, '未认证回落实例 org 时也不得看到 org-B').toEqual([]);
      expect(crossBody.orgId).toBe('org-A');

      const own = await fetch(`${baseUrlNoAuth}/api/sessions/search?q=d826markalpha`);
      const ownBody = await own.json() as SearchBody;
      expect(ownBody.results?.length ?? 0).toBeGreaterThanOrEqual(1);
      expect(ownBody.results?.every(r => r.orgId === 'org-A')).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.SYNOVA_ORG_ID; else process.env.SYNOVA_ORG_ID = prev;
    }
  }, 30_000);

  it('D826-7 边界：limit 非法/超界不抛（200 + 结果数受控）', async () => {
    for (const limit of ['abc', '-1', '99999']) {
      const res = await fetch(`${baseUrl}/api/sessions/search?q=D826MARK&limit=${limit}`, {
        headers: { Authorization: `Bearer ${tokenFor('org-A')}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json() as SearchBody;
      expect((body.results?.length ?? 0)).toBeLessThanOrEqual(50);
    }
  }, 30_000);
});
