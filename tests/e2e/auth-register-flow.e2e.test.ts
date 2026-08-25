/**
 * tests/e2e/auth-register-flow.e2e.test.ts — D486 register 认证闭环 端到端测试切片
 *
 * 4 阶段真实 server 全链路（铁律 12: 真实路由不 mock 管线）：
 *   ① 个人轨: auth/register 201 → login 200 → 受保护端点 /api/auth/validate 200
 *   ② 企业轨: enterprise/register 200 (orgId+admin) → admin login → invite 200 (token)
 *   ③ 接受: invitation/accept 200 (新 email) → login → 企业端点 /api/enterprise/status 200
 *   ④ 边界+入口: 个人账号调企业 admin 端点 403（创始人决策: 个人轨不接企业系统）+
 *      首诊入口 /api/diagnosis/consult 400 VALIDATION_ERROR（可达性，不触发六阶段）
 *
 * 真实 server 运行契约（customer-flow D247 同模式基线）:
 *   server 必须运行于 PORT=3099（vitest env 注入 PORT=3099，detectPort 对齐），
 *   且显式 JWT_SECRET（否则 DEV_MODE 自动 admin 会破坏 401/403 边界断言——
 *   ① 的无 token 401 断言会抓住这种环境错误）:
 *     PORT=3099 JWT_SECRET=d486-e2e-test-secret SYNOVA_DB_PATH=./data/e2e-scratch.db npx tsx src/index.ts
 *
 * 降级语义: server 未启动 → beforeAll 探活失败 → 各 it() 显式 ctx.skip()
 *   （非静默空跑——DS3 验收要求非 skip 全 pass）
 * 隔离: 专属 scratch DB + 带运行时间戳 email（重复运行不 409），不污染真实 dev 库
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';

function detectPort(): number {
  try {
    if (process.env.PORT) return parseInt(process.env.PORT, 10);
    if (existsSync('synova.json')) {
      const cfg = JSON.parse(readFileSync('synova.json', 'utf-8')) as { server?: { port?: number } };
      if (cfg?.server?.port) return cfg.server.port;
    }
  } catch { /* fallback */ }
  return 3000;
}

const PORT = detectPort();
const BASE = `http://localhost:${PORT}`;

// email 带运行时间戳 — 重复运行不触发 409 DUPLICATE
const RUN_TS = Date.now().toString(36);
const PERSONAL_EMAIL = `d486-personal-${RUN_TS}@synova.test`;
const PERSONAL_PASSWORD = 'd486-personal-pass';
const ADMIN_EMAIL = `d486-admin-${RUN_TS}@synova.test`;
const ADMIN_PASSWORD = 'd486-admin-pass';
const ORG_NAME = 'D486 E2E 测试企业';
const INVITEE_EMAIL = `d486-invitee-${RUN_TS}@synova.test`;
const INVITEE_PASSWORD = 'd486-invitee-pass';

let serverDown = true;

/** fetch 封装: 网络层失败 → 断言失败（server 存活性由 beforeAll 探活统一判定） */
async function api(path: string, options: RequestInit = {}, token?: string): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${BASE}${path}`, { ...options, headers });
}

beforeAll(async () => {
  // 探活: GET /api/healthz（白名单健康端点），3s 超时。
  // 任何 HTTP 响应 = server 在监听；网络错误/超时 = server 未启动 → 全部 skip。
  try {
    await fetch(`${BASE}/api/healthz`, { signal: AbortSignal.timeout(3000) });
    serverDown = false;
  } catch {
    serverDown = true;
  }
}, 10_000);

describe('D486 — register 认证闭环 E2E（真实 server）', () => {
  let personalToken = '';
  let adminToken = '';
  let inviteToken = '';
  let orgId = '';

  it('① 个人轨: auth/register 201 → login 200 → 受保护端点 200（无 token 401 证明认证层生效）', async (ctx) => {
    if (serverDown) { ctx.skip(); return; }

    // 注册（白名单匿名可达 — D483 切片 A）
    const reg = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email: PERSONAL_EMAIL, password: PERSONAL_PASSWORD }),
    });
    expect(reg.status).toBe(201);
    const regBody = await reg.json() as { ok: boolean; token: string; payload: { userId: string; role: string; orgId: string } };
    expect(regBody.ok).toBe(true);
    expect(regBody.token).toBeTruthy();
    expect(regBody.payload.role).toBe('staff');
    expect(regBody.payload.orgId).toBe('default');

    // 登录
    const login = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: PERSONAL_EMAIL, password: PERSONAL_PASSWORD }),
    });
    expect(login.status).toBe(200);
    const loginBody = await login.json() as { ok: boolean; token: string };
    expect(loginBody.ok).toBe(true);
    expect(loginBody.token).toBeTruthy();
    personalToken = loginBody.token;

    // 受保护端点（validate 不在白名单 — 带 token 200）
    const validate = await api('/api/auth/validate', {}, personalToken);
    expect(validate.status).toBe(200);
    const validateBody = await validate.json() as { ok: boolean; payload: { userId: string } };
    expect(validateBody.ok).toBe(true);
    expect(validateBody.payload.userId).toBeTruthy();

    // 认证层真实生效基线: 无 token → 401（server 若以 DEV_MODE 自动 admin 运行，此断言抓住）
    const noToken = await api('/api/auth/validate');
    expect(noToken.status).toBe(401);
    const noTokenBody = await noToken.json() as { code: string };
    expect(noTokenBody.code).toBe('UNAUTHORIZED');
  });

  it('② 企业轨: enterprise/register 200 (orgId+admin) → admin login → invite 200 (token)', async (ctx) => {
    if (serverDown) { ctx.skip(); return; }

    // 企业注册（匿名可达 — D484 切片 B）
    const entReg = await api('/api/enterprise/register', {
      method: 'POST',
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, orgName: ORG_NAME }),
    });
    expect(entReg.status).toBe(200);
    const entRegBody = await entReg.json() as { ok: boolean; data: { orgId: string; userId: string; email: string; role: string } };
    expect(entRegBody.ok).toBe(true);
    expect(entRegBody.data.orgId).toMatch(/^org-/);
    expect(entRegBody.data.role).toBe('admin');
    orgId = entRegBody.data.orgId;

    // admin 真实 login
    const adminLogin = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    });
    expect(adminLogin.status).toBe(200);
    const adminLoginBody = await adminLogin.json() as { ok: boolean; token: string };
    expect(adminLoginBody.ok).toBe(true);
    expect(adminLoginBody.token).toBeTruthy();
    adminToken = adminLoginBody.token;

    // admin 发邀请（requireAdmin 放行）
    const invite = await api('/api/enterprise/invite', {
      method: 'POST',
      body: JSON.stringify({ email: INVITEE_EMAIL, role: 'staff' }),
    }, adminToken);
    expect(invite.status).toBe(200);
    const inviteBody = await invite.json() as { ok: boolean; data: { token: string; email: string; role: string } };
    expect(inviteBody.ok).toBe(true);
    expect(inviteBody.data.token).toMatch(/^inv-/);
    expect(inviteBody.data.email).toBe(INVITEE_EMAIL);
    inviteToken = inviteBody.data.token;
  });

  it('③ 接受: invitation/accept 200 (新 email) → login → 企业端点 200', async (ctx) => {
    if (serverDown) { ctx.skip(); return; }

    // 匿名接受邀请（邀请链接直达语义 — token 即凭证）
    const accept = await api('/api/enterprise/invitation/accept', {
      method: 'POST',
      body: JSON.stringify({ token: inviteToken, password: INVITEE_PASSWORD }),
    });
    expect(accept.status).toBe(200);
    const acceptBody = await accept.json() as { ok: boolean; data: { userId: string; email: string; role: string; orgId: string } };
    expect(acceptBody.ok).toBe(true);
    expect(acceptBody.data.email).toBe(INVITEE_EMAIL);
    expect(acceptBody.data.role).toBe('staff');
    expect(acceptBody.data.orgId).toBe(orgId);

    // 邀请用户真实 login
    const inviteeLogin = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: INVITEE_EMAIL, password: INVITEE_PASSWORD }),
    });
    expect(inviteeLogin.status).toBe(200);
    const inviteeLoginBody = await inviteeLogin.json() as { ok: boolean; token: string };
    expect(inviteeLoginBody.ok).toBe(true);
    expect(inviteeLoginBody.token).toBeTruthy();
    const staffToken = inviteeLoginBody.token;

    // 企业端点可达（status 非白名单: 认证通过 + 同 org 数据可见）
    const status = await api('/api/enterprise/status', {}, staffToken);
    expect(status.status).toBe(200);
    const statusBody = await status.json() as { ok: boolean; data: { orgId: string } };
    expect(statusBody.ok).toBe(true);
    expect(statusBody.data.orgId).toBe(orgId);
  });

  it('④ 边界+入口: 个人账号调企业 admin 端点 403 + 首诊入口 400 VALIDATION_ERROR', async (ctx) => {
    if (serverDown) { ctx.skip(); return; }

    // 个人账号（staff, org 'default'）调企业 admin 端点 → 403
    // （创始人决策: 个人轨不接企业系统 — requireAdmin 拒绝 staff）
    const staffInvite = await api('/api/enterprise/invite', {
      method: 'POST',
      body: JSON.stringify({ email: `d486-forbidden-${RUN_TS}@synova.test`, role: 'staff' }),
    }, personalToken);
    expect(staffInvite.status).toBe(403);
    const staffInviteBody = await staffInvite.json() as { code: string };
    expect(staffInviteBody.code).toBe('FORBIDDEN');

    // 首诊入口可达性（不触发六阶段）: 带 token + 缺 teamId → 400 VALIDATION_ERROR
    // （diagnosis.ts 同步校验在 SSE 写头之前 — 证明 token 穿透认证层且路由处理器真实到达）
    const consult = await api('/api/diagnosis/consult', {
      method: 'POST',
      body: JSON.stringify({}),
    }, personalToken);
    expect(consult.status).toBe(400);
    const consultBody = await consult.json() as { code: string };
    expect(consultBody.code).toBe('VALIDATION_ERROR');
  });
});
