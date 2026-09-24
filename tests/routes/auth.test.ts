/**
 * tests/routes/auth.test.ts — Auth 路由测试 (Phase 0.1 + D948 切片 A 增量)
 *
 * 铁律 33: *.test.ts 命名约定。
 * 单元级：验证路由注册与 router 形态（原 5 条，保留）。
 * D948 增量（真实 HTTP + **载荷级**断言，对齐派单件决策③「提交时就该拦」）：
 *   A1  登录返回 token 解码后 `payload.department === 该用户记录的部门`
 *   A7  refresh 签发的新 token 仍带原 department（刷新不丢部门）
 *   R4  register **不取** body 的 department（客户端自报身份完全不允许）——body 带 department 也必须无效
 *   降级 记录无部门（'' ⇒ 归一为 undefined）：token 无该键但**仍是合法凭证**
 *   降级 JWT_SECRET 不可用 → 500 + degraded:true（不静默放行、不签空 token）
 *
 * 夹具形态：`InMemoryGraphStore`（UserStore 的**真实依赖实现**，非 mock 管线）+ `setUserStore` 注入
 *   —— 先例 tests/routes/enterprise.test.ts:48-75 与 :178-197。
 *   不 mock fetch、不 mock 路由：express + jwtAuthMiddleware + authRoutes + listen(0) + 真实 fetch。
 * 铁律 38: 零 `as any` / `as never` / `as unknown as`。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import { createLogger } from '@synova/logger';
import authRoutes, { setUserStore } from '../../src/routes/auth';
import { jwtAuthMiddleware, verifyJwtToken } from '../../src/middleware/auth';
import { UserStore, type GraphStoreLike } from '../../src/growth/user-store';

const log = createLogger('test/d948-auth-routes');

// ═══ 内存 GraphStoreLike（真实组件实现；createNode 原样存 props ⇒ department 天然透传）═══
class InMemoryGraphStore implements GraphStoreLike {
  private nodes = new Map<string, { id: string; type: string; props: Record<string, unknown> }>();
  private counter = 0;

  createNode(type: string, props: Record<string, unknown>, _graph: string): string {
    const id = `node-${++this.counter}`;
    this.nodes.set(id, { id, type, props });
    return id;
  }

  queryNodes(type: string, filters?: Record<string, unknown>, _graph?: string):
    Array<{ id: string; type: string; props: Record<string, unknown> }> {
    const all = Array.from(this.nodes.values()).filter(n => n.type === type);
    if (!filters) return all;
    return all.filter(n => Object.entries(filters).every(([k, v]) => n.props[k] === v));
  }

  getNode(id: string, _graph: string): unknown | null {
    return this.nodes.get(id) ?? null;
  }

  updateNode(id: string, props: Record<string, unknown>, _graph: string): void {
    const node = this.nodes.get(id);
    if (node) node.props = { ...node.props, ...props };
  }
}

const ORG = 'org-d948-auth';
const MKT_EMAIL = 'mkt-d948@synova.test';
const MKT_DEPT = 'marketing';
const NODEPT_EMAIL = 'nodept-d948@synova.test';
const PASSWORD = 'd948-pass-1234';

let server: Server | undefined;
let BASE = '';
const savedEnv: Record<string, string | undefined> = {};

interface ApiResult { status: number; body: Record<string, unknown> }

async function api(
  path: string,
  opts: { method?: string; token?: string; body?: unknown } = {},
): Promise<ApiResult> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.token) headers['authorization'] = `Bearer ${opts.token}`;
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === 'object' && parsed !== null) body = parsed as Record<string, unknown>;
  } catch (err: unknown) {
    // 非 JSON 响应不是错误路径，但要留痕（铁律 24：禁静默吞）
    log.warn({ err, status: res.status }, 'D948 夹具: 响应体非 JSON，保留原文供断言诊断');
    body = { _raw: text };
  }
  return { status: res.status, body };
}

/** 取响应体里的 token（缺失即判空转，绝不静默继续） */
function pickToken(body: Record<string, unknown>): string {
  const t = body['token'];
  if (typeof t !== 'string' || t.length === 0) {
    throw new Error(`响应体缺 token（夹具判空转）: ${JSON.stringify(body)}`);
  }
  return t;
}

/** 解码 token 载荷段（base64url 第二段）—— A1/A7 的判据载体 */
function decodePayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  expect(parts.length, 'JWT 必须为三段').toBe(3);
  const parsed: unknown = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  if (typeof parsed !== 'object' || parsed === null) throw new Error('载荷非对象');
  return parsed as Record<string, unknown>;
}

beforeAll(async () => {
  // ═══ N1 硬前置 —— 先覆写，再断言（不得断言 ambient env）═══
  // vitest.config.ts:58-63 全局注入 DEV_MODE='true'；不覆写则 dev-admin 逃生口生效 ⇒ 判据空转。
  savedEnv.JWT_SECRET = process.env.JWT_SECRET;
  savedEnv.DEV_MODE = process.env.DEV_MODE;

  process.env.JWT_SECRET = 'd948-auth-test-secret-0123456789';
  process.env.DEV_MODE = 'false';

  expect(process.env.JWT_SECRET?.length ?? 0).toBeGreaterThanOrEqual(16);
  expect(process.env.DEV_MODE).toBe('false');

  // ═══ 播种：真实 UserStore + 内存 GraphStore（含部门 / 无部门各一）═══
  const userStore = new UserStore(new InMemoryGraphStore());
  const withDept = await userStore.createUser(MKT_EMAIL, PASSWORD, 'manager', ORG, { department: MKT_DEPT });
  const noDept = await userStore.createUser(NODEPT_EMAIL, PASSWORD, 'manager', ORG);
  expect(withDept.userId.length, '播种失败（夹具判空转）').toBeGreaterThan(0);
  expect(noDept.userId.length, '播种失败（夹具判空转）').toBeGreaterThan(0);
  // 夹具自证：记录里的部门确实是 marketing / 空串（graph 路径写 extra?.department || ''）
  expect(userStore.queryByEmail(MKT_EMAIL)?.department).toBe(MKT_DEPT);
  expect(userStore.queryByEmail(NODEPT_EMAIL)?.department).toBe('');
  setUserStore(userStore);   // 注入 auth 路由（生产由 synova-agent.ts 注入）

  const app = express();
  app.use(express.json());
  app.use(jwtAuthMiddleware);   // 生产同构（server.ts:344）
  app.use(authRoutes);
  BASE = await new Promise<string>((resolve, reject) => {
    server = app.listen(0);
    server.once('listening', () => {
      const addr = server?.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      if (!port) reject(new Error('夹具启动失败：未取得端口'));
      else resolve(`http://127.0.0.1:${port}`);
    });
    server.once('error', reject);
  });
}, 30_000);

afterAll(() => {
  if (server) server.close();
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

// ════════════════════════════════════════════════════════════════
// 原有用例（Phase 0.1 路由注册）——保留
// ════════════════════════════════════════════════════════════════

describe('auth routes module', () => {
  it('模块导出默认 router', () => {
    expect(authRoutes).toBeTruthy();
    expect(typeof authRoutes).toBe('function'); // Express Router 是函数
    expect(authRoutes.stack).toBeTruthy();
    expect(Array.isArray(authRoutes.stack)).toBe(true);
  });

  it('已注册 POST /api/auth/login', () => {
    const route = authRoutes.stack.find((layer: { route?: { path?: string; methods?: Record<string, boolean> } }) =>
      layer.route?.path === '/api/auth/login' && layer.route?.methods?.['post'],
    );
    expect(route).toBeTruthy();
  });

  it('已注册 POST /api/auth/refresh', () => {
    const route = authRoutes.stack.find((layer: { route?: { path?: string; methods?: Record<string, boolean> } }) =>
      layer.route?.path === '/api/auth/refresh' && layer.route?.methods?.['post'],
    );
    expect(route).toBeTruthy();
  });

  it('已注册 POST /api/auth/revoke', () => {
    const route = authRoutes.stack.find((layer: { route?: { path?: string; methods?: Record<string, boolean> } }) =>
      layer.route?.path === '/api/auth/revoke' && layer.route?.methods?.['post'],
    );
    expect(route).toBeTruthy();
  });

  it('已注册 GET /api/auth/validate', () => {
    const route = authRoutes.stack.find((layer: { route?: { path?: string; methods?: Record<string, boolean> } }) =>
      layer.route?.path === '/api/auth/validate' && layer.route?.methods?.['get'],
    );
    expect(route).toBeTruthy();
  });

  it('Router stack 至少有 4 个路由（login + refresh + revoke + validate）', () => {
    const routeCount = authRoutes.stack.filter(
      (layer: { route?: unknown }) => layer.route,
    ).length;
    expect(routeCount).toBeGreaterThanOrEqual(4);
  });
});

// ════════════════════════════════════════════════════════════════
// A1 — 登录签发带 department（**解码载荷**断言，不等 HTTP 200）
// ════════════════════════════════════════════════════════════════

describe('D948/A1 — login 签发带 department', () => {
  it('正路径: token 载荷 department === UserStore 记录的部门（marketing）', async () => {
    const r = await api('/api/auth/login', { method: 'POST', body: { email: MKT_EMAIL, password: PASSWORD } });
    expect(r.status, `实得 ${r.status} ${JSON.stringify(r.body)}`).toBe(200);
    const token = pickToken(r.body);

    // 判据本体: 解码载荷（不是 HTTP 码、不是响应体 payload 字段）
    expect(decodePayload(token)['department']).toBe(MKT_DEPT);
    // 双证（防"自己解自己"）：验签回读同值 ⇒ token 已由本进程真实签发
    const verified = verifyJwtToken(token);
    expect(verified.payload?.department).toBe(MKT_DEPT);
    expect(verified.payload?.sub.length).toBeGreaterThan(0);
  });

  it('降级路径: 记录无部门（空串 ⇒ 归一 undefined）→ 载荷无该键，但 token 仍合法', async () => {
    const r = await api('/api/auth/login', { method: 'POST', body: { email: NODEPT_EMAIL, password: PASSWORD } });
    expect(r.status).toBe(200);
    const token = pickToken(r.body);
    expect('department' in decodePayload(token)).toBe(false);
    // 决策②: 拒绝的是部门工作区访问，不是凭证本身 ⇒ 无部门 token 必须仍可通过验签
    expect(verifyJwtToken(token).payload?.sub.length).toBeGreaterThan(0);
  });

  it('边界: 客户端 body 里塞 department 不影响签发（login 不读 body 的 department）', async () => {
    const r = await api('/api/auth/login', {
      method: 'POST',
      body: { email: NODEPT_EMAIL, password: PASSWORD, department: 'executive' },
    });
    expect(r.status).toBe(200);
    expect('department' in decodePayload(pickToken(r.body))).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════
// A7 — refresh 不丢部门
//   硬约束: `/api/auth/refresh` **不在白名单**（白名单只有精确 /api/auth/login、/api/auth/register，
//   middleware/auth.ts:107-108）⇒ 旧 token 必须放 **Authorization: Bearer**；
//   只放 body.token 会在路由前被 jwtAuthMiddleware 401。
// ════════════════════════════════════════════════════════════════

describe('D948/A7 — refresh 保留 department', () => {
  it('正路径: 带部门旧 token（Bearer）→ 新 token 仍带原部门', async () => {
    const login = await api('/api/auth/login', { method: 'POST', body: { email: MKT_EMAIL, password: PASSWORD } });
    const oldToken = pickToken(login.body);

    const r = await api('/api/auth/refresh', { method: 'POST', token: oldToken, body: {} });
    expect(r.status, `实得 ${r.status} ${JSON.stringify(r.body)}`).toBe(200);
    const newToken = pickToken(r.body);
    expect(newToken).not.toBe(oldToken);
    expect(decodePayload(newToken)['department']).toBe(MKT_DEPT);
  });

  it('降级路径: 旧 token 无部门 → 新 token 无该键，且刷新不被 fail-closed 拒绝', async () => {
    const login = await api('/api/auth/login', { method: 'POST', body: { email: NODEPT_EMAIL, password: PASSWORD } });
    const oldToken = pickToken(login.body);

    const r = await api('/api/auth/refresh', { method: 'POST', token: oldToken, body: {} });
    // 无部门 JWT 是合法凭证 ⇒ 拒绝刷新属"可达性收窄"而非安全收窄，故必须 200
    expect(r.status).toBe(200);
    expect('department' in decodePayload(pickToken(r.body))).toBe(false);
  });

  it('硬约束自证: 只放 body.token（不带 Bearer）→ 路由前 401', async () => {
    const login = await api('/api/auth/login', { method: 'POST', body: { email: MKT_EMAIL, password: PASSWORD } });
    const oldToken = pickToken(login.body);
    const r = await api('/api/auth/refresh', { method: 'POST', body: { token: oldToken } });
    expect(r.status).toBe(401);   // jwtAuthMiddleware 先于路由（refresh 非白名单）
  });
});

// ════════════════════════════════════════════════════════════════
// R4 — register 不取 body 的 department（创始人决策①：客户端自报身份完全不允许）
// ════════════════════════════════════════════════════════════════

describe('D948/R4 — register 的 department 只能来自授权来源（不取 body）', () => {
  it('body 带 department=marketing → 签发 token 无该键（未被采信）', async () => {
    const r = await api('/api/auth/register', {
      method: 'POST',
      body: { email: 'r4-d948@synova.test', password: PASSWORD, role: 'manager', orgId: ORG, department: 'marketing' },
    });
    expect(r.status, '注册应 201').toBe(201);
    const token = pickToken(r.body);
    expect('department' in decodePayload(token)).toBe(false);
    // 落库侧同样不得写入 body 的 department（否则后续 refresh/再次登录会把自报值带回来）
    const again = await api('/api/auth/login', {
      method: 'POST', body: { email: 'r4-d948@synova.test', password: PASSWORD },
    });
    expect(again.status).toBe(200);
    expect('department' in decodePayload(pickToken(again.body))).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════
// 降级 — JWT_SECRET 不可用：500 + degraded:true（不签空 token、不静默放行）
// ════════════════════════════════════════════════════════════════

describe('D948 降级 — 签发判据不可用', () => {
  it('JWT_SECRET 缺失且 DEV_MODE=false → login 500 + degraded:true', async () => {
    const prev = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    try {
      const r = await api('/api/auth/login', { method: 'POST', body: { email: MKT_EMAIL, password: PASSWORD } });
      expect(r.status).toBe(500);
      expect(r.body['degraded']).toBe(true);
      expect(r.body['code']).toBe('AUTH_CONFIG_ERROR');
      expect(r.body['token']).toBeUndefined();   // 绝不静默签发"无部门/无效"token
    } finally {
      if (prev === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = prev;
    }
  });
});
