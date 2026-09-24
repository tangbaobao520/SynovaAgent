/**
 * tests/routes/d948-department-visibility.test.ts — D948 切片 A：部门可见性链（A3 / A4 / A5 / A6补充 / FG-6）
 *
 * 主题：「签发端带部门 → 验签注入 req.auth → rbac 取真实部门 → 工作区可见性」这条**完整身份链**
 *   在部门可见性上的行为。宿主来源：A-recon §3（F-1 阻断）+ CTO R2 裁定（本文件为 A3/A4 宿主）。
 *
 * ── 为什么用「链式捕获探针」而不是直接打 HTTP ────────────────────────────────
 * `GET /api/workspaces/mine` 在 HTTP 面被 `router.get('/api/workspaces/:id')`（workspaces-api.ts:126）
 * 遮蔽 —— 后者注册早于 `:264` 的 `/mine`，Express 顺序匹配 ⇒ `:id`='mine' ⇒ 恒 404
 * （先例与现状锁定断言：tests/routes/workspace-access-write-endpoint.test.ts:425-432；
 *  D947/L-28 已裁定**本卡不修 ordering**，写集不含 workspaces-api.ts）。
 * 故本文件用**真实 express + 真实 jwtAuthMiddleware + 真实 rbacMiddleware** 跑一次请求，
 * 把**经真实中间件链注入后的 req** 捕获下来，再喂给从路由表抽出的**真实 handler**。
 *   · 只绕「路由遮蔽」，**不绕身份链**（req.auth / req.rbac 全部由生产中间件真实产生）。
 *   · **禁用**合成 `req.rbac`（别的夹具的 syntheticRbac 写死 `department: undefined` 且无形参）
 *     —— 合成值既不反映 A1/A2 的改动，又制造假红/假绿（复核 B-0b）。
 *
 * ── 判别性（改坏即报红）─────────────────────────────────────────────────
 *   · A3: 把 rbac.ts:127 改回 `department: undefined` ⇒ A3 两条腿全红
 *   · A4: 把 workspaces-api.ts:286 的 `w.department === dept` 改 `true`（**过宽型**）⇒ A4 红、A3 仍绿
 *     （收窄型变异体对 A4 无效：负向断言只会更绿 —— 复核 §18.2）
 *   · A5: 去掉 rbac.ts isSameDepartment 的非空收窄（天真 `a === b`）⇒ 空串/双空边界红
 *   · FG-6: 把环境切成 dev-admin 姿态（DEV_MODE='true' 且无 JWT_SECRET）⇒ 「无效 Bearer → 401」
 *     与「身份 ≠ dev-admin」两条断言红（证明走的是验签分支 auth.ts:369 起，不是 :348-365 逃生口）
 *
 * 铁律 12 / 禁 grep 型静态判据：本文件零源码文本匹配，全部为运行时行为断言。
 * 铁律 38：零 `as any` / `as never` / `as unknown as`（收窄一律单步 `as` + 内联类型）。
 * 铁律 48：每条用例均有 expect；覆盖正常（A3）/ 拒绝（A4、A5）/ 边界（空串、双空、单侧空）/ 判别（FG-6）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Request, Server } from 'http';
import { createLogger } from '@synova/logger';
import { signJwtToken, jwtAuthMiddleware } from '../../src/middleware/auth';
import { rbacMiddleware, canAccessWorkspace, canModifyWorkspace, type RbacContext } from '../../src/middleware/rbac';
import workspacesApiRoutes from '../../src/routes/workspaces-api';

const log = createLogger('test/d948-department-visibility');

// ════════════════════════════════════════════════════════════════
// 夹具状态
// ════════════════════════════════════════════════════════════════

const ORG = 'org-d948';
let server: Server | undefined;
let BASE = '';
const savedEnv: Record<string, string | undefined> = {};

/** 经真实中间件链注入后的请求对象（链式捕获探针的产物） */
const probeReqs: Request[] = [];

interface ApiResult { status: number; body: Record<string, unknown> }

/** 真实 HTTP 调用（不 mock fetch —— 铁律 12） */
async function api(
  path: string,
  opts: { method?: string; token?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<ApiResult> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(opts.headers ?? {}) };
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
    // 非 JSON 响应（如 500 纯文本）不是错误路径，但要留痕（铁律 24：禁静默吞）
    log.warn({ err, status: res.status }, 'D948 夹具: 响应体非 JSON，保留原文供断言诊断');
    body = { _raw: text };
  }
  return { status: res.status, body };
}

/**
 * 跑一次真实 HTTP，取回**经 jwtAuthMiddleware + rbacMiddleware 注入后**的 req。
 * 用途：把真实身份链的产物喂给被遮蔽的 `/mine` handler（只绕遮蔽，不绕链路）。
 */
async function captureReq(token: string, headers: Record<string, string> = {}): Promise<Request> {
  const before = probeReqs.length;
  const r = await api('/__d948/probe', { method: 'POST', token, headers });
  expect(r.status, '探针请求应 200（夹具判空转：401 说明 Bearer 未被验签分支采纳）').toBe(200);
  expect(probeReqs.length, '探针未捕获到 req（夹具判空转）').toBe(before + 1);
  return probeReqs[probeReqs.length - 1];
}

/** 验签身份读取器（FG-6：确认 req.auth 来自验签分支而非 dev-admin 逃生口） */
function readAuth(req: Request): { sub: string; role: string; department?: string; jti: string } {
  const holder = req as Request & {
    auth?: { sub?: unknown; role?: unknown; department?: unknown; jti?: unknown };
  };
  const a = holder.auth;
  if (!a) throw new Error('req.auth 缺失 —— jwtAuthMiddleware 未注入（夹具判空转）');
  return {
    sub: String(a.sub),
    role: String(a.role),
    department: a.department === undefined ? undefined : String(a.department),
    jti: String(a.jti),
  };
}

/** rbac 上下文读取器（确认 rbacMiddleware 消费了 req.auth） */
function readRbac(req: Request): RbacContext {
  const holder = req as Request & { rbac?: RbacContext };
  if (!holder.rbac) throw new Error('req.rbac 缺失 —— rbacMiddleware 未执行（夹具判空转）');
  return holder.rbac;
}

/** 从响应体读工作区（内联类型断言，零 as any / as never / as unknown as） */
function pickWorkspace(body: Record<string, unknown>): {
  id: string; owner?: string; department?: string; visibility?: string;
} {
  const w = body['workspace'];
  if (typeof w !== 'object' || w === null) throw new Error('响应体缺 workspace 对象');
  return w as { id: string; owner?: string; department?: string; visibility?: string };
}

/** 从 /mine 响应体读工作区 id 列表 */
function pickWorkspaceIds(body: Record<string, unknown>): string[] {
  const raw = body['workspaces'];
  if (!Array.isArray(raw)) return [];
  const ids: string[] = [];
  for (const item of raw) {
    if (typeof item === 'object' && item !== null) {
      const id = (item as { id?: unknown }).id;
      if (typeof id === 'string') ids.push(id);
    }
  }
  return ids;
}

interface RouteLayer {
  route?: {
    path?: string;
    methods?: Record<string, boolean>;
    stack: Array<{ handle: (req: unknown, res: unknown) => unknown }>;
  };
}

/**
 * 取 /mine 的真实 handler（绕过 `/:id` 遮蔽；handler 本体是生产代码，不是副本）。
 * 路由表不在 express 的公开类型里 ⇒ 先落到 `unknown` 变量再**单步** `as`（不用 `as unknown as`，铁律 38）。
 */
function loadMineHandler(): (req: unknown, res: unknown) => unknown {
  const routerUnknown: unknown = workspacesApiRoutes;
  const stack = (routerUnknown as { stack: RouteLayer[] }).stack;
  expect(Array.isArray(stack), '路由表 stack 必须可枚举（否则判空转）').toBe(true);
  const layer = stack.find((l) => l.route?.path === '/api/workspaces/mine' && l.route?.methods?.['get']);
  expect(layer?.route, 'GET /api/workspaces/mine handler 必须可提取（否则判空转）').toBeDefined();
  const handler = layer?.route?.stack[0]?.handle;
  expect(handler, 'handler 缺失（判空转）').toBeDefined();
  return handler as (req: unknown, res: unknown) => unknown;
}

/** 以捕获到的真实 req 调用 /mine handler，返回 { status, body } */
async function callMine(req: Request): Promise<{ status: number; body: Record<string, unknown> }> {
  const handler = loadMineHandler();
  let status = 200;
  let wroteJson = false;
  let payload: Record<string, unknown> = {};
  const res = {
    status: (c: number) => { status = c; return res; },
    json: (b: unknown) => { wroteJson = true; payload = (b as Record<string, unknown>) ?? {}; return res; },
  };
  await handler(req, res);
  // 判据不得被丢弃：handler 必须真的写出响应（否则判空转）
  expect(wroteJson, 'handler 未写出 JSON 响应（判据被丢弃 / 未接线）').toBe(true);
  return { status, body: payload };
}

function jwt(sub: string, role: string, department?: string): string {
  const t = signJwtToken({ sub, role, orgId: ORG, department });
  if (!t) throw new Error('signJwtToken 返回 null — JWT_SECRET 未就位（夹具应判空转）');
  return t;
}

let T_ADMIN = '';    // admin（播种用）
let T_MKT = '';      // manager + department=marketing（正路径）
let T_SALES = '';    // manager + department=sales（异部门负路径）
let T_NODEPT = '';   // manager + 无 department（A5 默认拒绝）
let T_STAFF = '';    // staff + **无 department**（A6 对照用：自报头若被采信会把身份抬成 admin）

let parentId = '';    // admin 属主 · visibility=global
let subMktId = '';    // admin 属主 · department=marketing · visibility=department
let subSalesId = '';  // admin 属主 · department=sales · visibility=department

beforeAll(async () => {
  // ════════════════════════════════════════════════════════════════
  // N1 硬前置 —— **先覆写**，**再**断言（不得断言 ambient env）
  //   vitest.config.ts:58-63 全局注入 DEV_MODE='true'；不覆写则 dev-admin 逃生口
  //   （auth.ts:348-365）会把任何请求变成 admin ⇒ 判据静默失效（空转，非通过）。
  // ════════════════════════════════════════════════════════════════
  savedEnv.JWT_SECRET = process.env.JWT_SECRET;
  savedEnv.DEV_MODE = process.env.DEV_MODE;
  savedEnv.SYNOVA_ORG_ID = process.env.SYNOVA_ORG_ID;

  process.env.JWT_SECRET = 'd948-test-secret-0123456789';
  process.env.DEV_MODE = 'false';
  process.env.SYNOVA_ORG_ID = ORG;

  expect(process.env.JWT_SECRET?.length ?? 0).toBeGreaterThanOrEqual(16);
  expect(process.env.DEV_MODE).toBe('false');

  T_ADMIN = jwt('admin-1', 'admin');
  T_MKT = jwt('mkt-1', 'manager', 'marketing');
  T_SALES = jwt('sales-1', 'manager', 'sales');
  T_NODEPT = jwt('nodept-1', 'manager');
  T_STAFF = jwt('staff-1', 'staff');

  const app = express();
  app.use(express.json());
  app.use(jwtAuthMiddleware);   // 真实认证层（生产 server.ts:344 同构）
  app.use(rbacMiddleware);      // 真实 RBAC 注入（生产 server.ts:366 同构）
  app.use(workspacesApiRoutes);
  // 探针路由：链走完后再兜住 req（只用于把真实 req 交给被遮蔽的 handler）
  app.post('/__d948/probe', (req, res) => {
    probeReqs.push(req);
    res.json({ ok: true });
  });

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

  // ═══ 夹具资源：admin 真实 JWT 经真实 HTTP 播种（不改写集外文件）═══
  const p = await api('/api/workspaces', { method: 'POST', token: T_ADMIN, body: { title: 'D948-P' } });
  expect(p.status, `夹具前置: admin 建父工作区应 200，实得 ${p.status} ${JSON.stringify(p.body)}`).toBe(200);
  parentId = pickWorkspace(p.body).id;

  const s1 = await api(`/api/workspaces/${parentId}/sub`, {
    method: 'POST', token: T_ADMIN, body: { department: 'marketing', title: 'D948-S-MKT' },
  });
  expect(s1.status, '夹具前置: 建子工作区(marketing) 应 200').toBe(200);
  subMktId = pickWorkspace(s1.body).id;

  const s2 = await api(`/api/workspaces/${parentId}/sub`, {
    method: 'POST', token: T_ADMIN, body: { department: 'sales', title: 'D948-S-SALES' },
  });
  expect(s2.status, '夹具前置: 建子工作区(sales) 应 200').toBe(200);
  subSalesId = pickWorkspace(s2.body).id;

  // 夹具自证（防"静默构造错"）：
  //   ① 两个 sub 的 id 必须互异 —— workspaces-api.ts:235 用 `ws_sub_${Date.now().toString(36)}`，
  //      同一毫秒创建会互相覆盖（后者替换前者）。不自证则 A3/A4 可能对着被覆盖的 id 断言而丢失判别力。
  expect(subMktId).not.toBe(subSalesId);
  //   ② 目标资源属性符合判据构造意图
  expect(pickWorkspace(p.body).visibility).toBe('global');
  expect(pickWorkspace(s1.body).department).toBe('marketing');
  expect(pickWorkspace(s1.body).visibility).toBe('department');
  expect(pickWorkspace(s1.body).owner).toBe('admin-1');
  expect(pickWorkspace(s2.body).department).toBe('sales');
}, 30_000);

afterAll(() => {
  if (server) server.close();
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

// ════════════════════════════════════════════════════════════════
// A3 — 同部门 manager：本部门工作区**可见**（正常路径，双腿）
// ════════════════════════════════════════════════════════════════

describe('A3 · 同部门 manager 可见本部门工作区', () => {
  it('腿 1（真 HTTP，canAccessWorkspace 判据）: GET /api/workspaces/:id/context → 200 + department=marketing', async () => {
    const r = await api(`/api/workspaces/${subMktId}/context`, { token: T_MKT });
    expect(r.status, `实得 ${r.status} ${JSON.stringify(r.body)}`).toBe(200);
    expect(r.body['department']).toBe('marketing');
    expect(r.body['workspaceId']).toBe(subMktId);
  });

  it('腿 2（链式捕获探针，/mine 过滤表达式）: 真实验签 req → handler → 含本部门子工作区', async () => {
    const req = await captureReq(T_MKT);
    // FG-6 前置：身份确实来自验签分支（详见本文件 FG-6 组）
    expect(readAuth(req).department).toBe('marketing');
    expect(readRbac(req).department).toBe('marketing');

    const r = await callMine(req);
    expect(r.status).toBe(200);
    expect(r.body['department']).toBe('marketing');
    const ids = pickWorkspaceIds(r.body);
    expect(ids).toContain(subMktId);          // 本部门 → 命中
    expect(ids).not.toContain(subSalesId);    // 他部门 → 不命中
    expect(ids).toContain(parentId);          // 对照：global 对非 admin 可见（防"恒空"假绿）
  });
});

// ════════════════════════════════════════════════════════════════
// A4 — 异部门 manager：**看不到**该部门工作区（隔离不回退）
//   断言形态要求：**不得断言"列表为空"** —— 父工作区 visibility='global'，
//   过滤条件含 `|| w.visibility === 'global'`（workspaces-api.ts:286）⇒ 两个部门的
//   manager 都能看到它。故必须断言"**不含目标部门工作区**"。
// ════════════════════════════════════════════════════════════════

describe('A4 · 异部门 manager 看不到该部门工作区', () => {
  it('腿 1（真 HTTP）: 异部门 manager 打 marketing 工作区 context → 403', async () => {
    const r = await api(`/api/workspaces/${subMktId}/context`, { token: T_SALES });
    expect(r.status).toBe(403);
    expect(r.body['error']).toBe('access denied');
  });

  it('腿 2（链式捕获探针）: 异部门 manager → /mine 不含 marketing 子工作区', async () => {
    const req = await captureReq(T_SALES);
    expect(readRbac(req).department).toBe('sales');

    const r = await callMine(req);
    expect(r.status).toBe(200);
    expect(r.body['department']).toBe('sales');
    const ids = pickWorkspaceIds(r.body);
    expect(ids).not.toContain(subMktId);      // 核心断言：跨部门不可见
    expect(ids).toContain(subSalesId);        // 对照：本部门可见（防"过滤过窄=全不可见"假绿）
    expect(ids).toContain(parentId);          // 对照：global 仍可见
  });

  it('对照（防"恒 403/恒空"假绿）: 同部门 manager 打同一工作区 → 200', async () => {
    // 与上一条构成成对判据：同一资源、同一端点，仅身份部门不同 ⇒ 403 vs 200。
    // 实现"一律拒绝" ⇒ 本例红；实现"一律放行" ⇒ 上一例红。
    const r = await api(`/api/workspaces/${subSalesId}/context`, { token: T_SALES });
    expect(r.status).toBe(200);
    expect(r.body['department']).toBe('sales');
  });
});

// ════════════════════════════════════════════════════════════════
// A5 — 默认拒绝不回退（无部门 / 空串 / 双空 / 单侧空 → 一律 deny）
//   硬约束（复核裁定）: 工作区必须 `ws.owner !== ctx.userId`，否则 rbac.ts:313 的
//   `|| ws.owner === ctx.userId` 会让 canModifyWorkspace 在**正确实现**上为 true ⇒ 假红。
// ════════════════════════════════════════════════════════════════

describe('A5 · 无部门/空串一律 fail-closed（owner 析取被刻意排除在外）', () => {
  const noDeptCtx: RbacContext = { role: 'manager', userId: 'nodept-1', authenticated: true };
  const mkCtx = (department?: string): RbacContext => ({
    role: 'manager', userId: 'm-x', department, authenticated: true,
  });
  const WS_MKT = { visibility: 'department' as const, department: 'marketing', owner: 'admin-1' };

  it('合法 JWT 但无 department + 部门工作区 → canAccess=false 且 canModify=false', async () => {
    expect(canAccessWorkspace(noDeptCtx, WS_MKT)).toBe(false);
    expect(canModifyWorkspace(noDeptCtx, WS_MKT)).toBe(false);
  });

  it('边界: 双空串（ctx="" + ws=""）→ 不得因 "" === "" 命中', () => {
    expect(canAccessWorkspace(mkCtx(''), { visibility: 'department', department: '', owner: 'admin-1' })).toBe(false);
    expect(canModifyWorkspace(mkCtx(''), { department: '', owner: 'admin-1' })).toBe(false);
  });

  it('边界: 单侧空串（ctx="" ws=marketing / ctx=marketing ws=""）→ 均不命中', () => {
    expect(canAccessWorkspace(mkCtx(''), WS_MKT)).toBe(false);
    expect(canAccessWorkspace(mkCtx('marketing'), { visibility: 'department', department: '', owner: 'admin-1' })).toBe(false);
    expect(canModifyWorkspace(mkCtx('marketing'), { department: '', owner: 'admin-1' })).toBe(false);
  });

  it('对照（防"恒 false"假绿）: 同部门且非属主 → 判据确实命中', () => {
    expect(canAccessWorkspace(mkCtx('marketing'), WS_MKT)).toBe(true);
    // 注意：同部门 ⇒ canModifyWorkspace 亦为 true（部门分支命中）。这正是 owner 必须错开的理由——
    // 若 ws.owner === ctx.userId，"无部门 → false"会被 owner 析取救回 ⇒ 假红。
    expect(canModifyWorkspace(mkCtx('marketing'), WS_MKT)).toBe(true);
    // 反向对照：owner 析取是**既有语义**（A5-b 不回改）——无部门但属主本人 → 仍可改
    expect(canModifyWorkspace(noDeptCtx, { department: 'marketing', owner: 'nodept-1' })).toBe(true);
  });

  it('无部门 manager 经真实链访问部门工作区 → 403（HTTP 腿）', async () => {
    const r = await api(`/api/workspaces/${subMktId}/context`, { token: T_NODEPT });
    expect(r.status).toBe(403);
  });

  it('无部门 manager → /mine 过滤不含任何部门工作区（链式捕获探针）', async () => {
    const req = await captureReq(T_NODEPT);
    expect(readRbac(req).department).toBeUndefined();
    const r = await callMine(req);
    expect(r.status).toBe(200);
    expect(r.body['department']).toBeUndefined();  // JSON 序列化丢弃 undefined ⇒ 键缺失
    const ids = pickWorkspaceIds(r.body);
    expect(ids).not.toContain(subMktId);
    expect(ids).not.toContain(subSalesId);
    expect(ids).toContain(parentId);               // 仍可见 global（可达性未被一刀切收窄）
  });
});

// ════════════════════════════════════════════════════════════════
// A6 — 自报头零复活（**补充性** HTTP 断言）
//   说明（防"假判据"）：A6 的**判别性**证据在单元级 —— extractAuthFromRequest /
//   extractRbacContext 在「只有 x-synova-token」时返回 null / 未认证（tests/middleware/auth.test.ts
//   与 tests/middleware/rbac.test.ts）。本组只补 HTTP 面的可达性事实：自报头**不产生身份**。
//   为什么不能只靠 HTTP：本 app 的非白名单路径先由 jwtAuthMiddleware 拦 Bearer（缺 Bearer 必 401），
//   该 401 与"自报分支是否复活"无关 ⇒ 单看 401 属「接线了≠被执行」型假判据。
// ════════════════════════════════════════════════════════════════

describe('A6 · x-synova-token 自报头不构成身份（HTTP 面补充断言）', () => {
  it('仅带自报头（无 Bearer）→ 401', async () => {
    const r = await api('/__d948/probe', {
      method: 'POST', headers: { 'x-synova-token': 'admin:marketing:u1' },
    });
    expect(r.status).toBe(401);
  });

  it('有效 Bearer(staff, 无部门) + 同请求自报 admin 头 → 身份仍是 staff，且看不到部门工作区', async () => {
    // 判别构造：Bearer 身份 = staff 且**无部门**。若任何实现把自报头采信（role=admin 或 dept=marketing），
    // 则结果会变成"看得到 marketing 子工作区" ⇒ 本断言必红。故本条对"自报分支复活"是有判别力的
    // （比"仅带自报头 → 401"强：那条 401 由缺 Bearer 产生，与自报分支无关）。
    const req = await captureReq(T_STAFF, { 'x-synova-token': 'admin:marketing:u1' });
    const auth = readAuth(req);
    expect(auth.role).toBe('staff');
    expect(auth.sub).toBe('staff-1');
    expect(auth.department).toBeUndefined();
    expect(readRbac(req).role).toBe('staff');
    expect(readRbac(req).department).toBeUndefined();

    const r = await callMine(req);
    expect(r.body['role']).toBe('staff');
    const ids = pickWorkspaceIds(r.body);
    expect(ids).not.toContain(subMktId);   // 自报头里的 marketing 未成为部门
    expect(ids).not.toContain(subSalesId);
    expect(ids).toContain(parentId);       // 对照：global 仍可见（防"恒空"假绿）
  });
});

// ════════════════════════════════════════════════════════════════
// FG-6 — 判别器：走的是**验签分支**（auth.ts:369 起）而非 dev-admin 逃生口（:348-365）
//   为什么必须有：若环境落到 dev-admin 姿态，任何请求都被当成 admin ⇒ 上面判据全绿
//   但**什么都没测到**（空转）。本组把"验签分支确实在工作"变成可执行断言。
// ════════════════════════════════════════════════════════════════

describe('FG-6 · 验签分支判别器（防 dev-admin 逃生口把判据变成空转）', () => {
  it('无效 Bearer → 401（dev-admin 姿态下会 200/admin）', async () => {
    const r = await api('/__d948/probe', { method: 'POST', token: 'not-a-valid-jwt' });
    expect(r.status).toBe(401);
    expect(r.body['code']).toBe('UNAUTHORIZED');
  });

  it('无 Authorization → 401', async () => {
    const r = await api('/__d948/probe', { method: 'POST' });
    expect(r.status).toBe(401);
  });

  it('验签身份 ≠ dev-admin（sub / jti 均非逃生口字面量）', async () => {
    const req = await captureReq(T_MKT);
    const auth = readAuth(req);
    expect(auth.sub).toBe('mkt-1');
    expect(auth.sub).not.toBe('dev-admin');
    expect(auth.jti).not.toBe('dev-mode-no-jwt');   // auth.ts:362 的 dev-admin jti 字面量
    expect(auth.role).toBe('manager');
  });

  it('环境自证：本夹具运行在 DEV_MODE=false 且 JWT_SECRET 就位（N1 覆写生效）', () => {
    expect(process.env.DEV_MODE).toBe('false');
    expect(process.env.JWT_SECRET?.length ?? 0).toBeGreaterThanOrEqual(16);
  });
});
