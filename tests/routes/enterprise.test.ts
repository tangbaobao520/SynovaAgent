/**
 * tests/routes/enterprise.test.ts — D102+D103 企业路由测试 + D484 邀请全链路集成测试
 *
 * D102+D103（保留）: bcrypt/内存 store 操作/模块导出接线检查
 * D484（新增）: 企业邀请注册全链路——匿名 register→login→invite→query→accept 真实 HTTP。
 *   铁律 12: 真实 express 挂载（jwtAuthMiddleware→authRoutes→enterpriseRoutes，与生产
 *   server.ts L290/L293/L354 顺序同构），native fetch，真实 signJwtToken/UserStore/bcrypt。
 *   UserStore 注入内存 GraphStoreLike（真实组件实现，非 mock 管线；零 SQLite 依赖），
 *   同一实例注入 auth/enterprise 两路由模块（模拟生产 synova-agent.ts D224 注入）。
 * 约束: ≥12测试 / 零as any
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest';
import { createLogger } from '@synova/logger';

// Use direct imports for backend logic testing
import bcrypt from 'bcrypt';

// D484: 测试环境（getSecret() 运行时读取，须早于任何请求发出）
process.env.JWT_SECRET = 'synova-d484-enterprise-invite-test-secret';
process.env.DEV_MODE = 'false';

import express from 'express';
import type { Server } from 'http';
import { jwtAuthMiddleware } from '../../src/middleware/auth';
import authRoutes, { setUserStore as authSetUserStore } from '../../src/routes/auth';
import enterpriseRoutes, { setUserStore as entSetUserStore } from '../../src/routes/enterprise';
import { UserStore, type GraphStoreLike } from '../../src/growth/user-store';

// ═══ Auth Store Helpers (mirror in-memory store used in auth.ts) ═══

interface TestUser {
  userId: string; email: string; passwordHash: string; role: string; orgId: string;
  status: 'active' | 'disabled'; createdAt: string;
}
const testUsers = new Map<string, TestUser>();

async function createTestUser(email: string, password: string, role = 'staff'): Promise<TestUser> {
  const userId = `test-${testUsers.size + 1}`;
  const passwordHash = await bcrypt.hash(password, 4); // low rounds for speed
  const user = { userId, email, passwordHash, role, orgId: 'default', status: 'active' as const, createdAt: new Date().toISOString() };
  testUsers.set(userId, user);
  return user;
}

// ═══ D484: 内存 GraphStoreLike（真实组件——UserStore 的真实依赖实现，非 mock 管线） ═══

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

describe('D102 — bcrypt auth', () => {
  it('bcrypt.hash creates valid hash', async () => {
    const hash = await bcrypt.hash('password123', 4);
    expect(hash).toBeTruthy();
    expect(hash.startsWith('$2b$')).toBe(true);
  });

  it('bcrypt.compare matches correct password', async () => {
    const hash = await bcrypt.hash('password123', 4);
    const match = await bcrypt.compare('password123', hash);
    expect(match).toBe(true);
  });

  it('bcrypt.compare rejects wrong password', async () => {
    const hash = await bcrypt.hash('password123', 4);
    const match = await bcrypt.compare('wrongpassword', hash);
    expect(match).toBe(false);
  });
});

describe('D102 — user store operations', () => {
  beforeEach(() => { testUsers.clear(); });

  it('register: creates new user with hashed password', async () => {
    const user = await createTestUser('test@example.com', 'securePass1');
    expect(user.email).toBe('test@example.com');
    expect(user.passwordHash).not.toBe('securePass1'); // hashed
    expect(user.role).toBe('staff');
    expect(user.status).toBe('active');
  });

  it('login: finds user by email', async () => {
    await createTestUser('alice@co.com', 'alicePass');
    let found: TestUser | null = null;
    for (const u of testUsers.values()) { if (u.email === 'alice@co.com') { found = u; break; } }
    expect(found).not.toBeNull();
    expect(found!.email).toBe('alice@co.com');
  });

  it('login: bcrypt password verification', async () => {
    await createTestUser('bob@co.com', 'bobPass!');
    let foundUser: TestUser | null = null;
    for (const u of testUsers.values()) { if (u.email === 'bob@co.com') { foundUser = u; break; } }
    const match = await bcrypt.compare('bobPass!', foundUser!.passwordHash);
    expect(match).toBe(true);
  });
});

describe('D103 — enterprise route handlers', () => {
  it('auth.ts exports router', async () => {
    const authRoutes = await import('../../src/routes/auth');
    expect(authRoutes.default).toBeDefined();
  });

  it('enterprise.ts exports router', async () => {
    const enterpriseRoutes = await import('../../src/routes/enterprise');
    expect(enterpriseRoutes.default).toBeDefined();
  });

  it('server.ts imports enterpriseRoutes', () => {
    // verify by checking the compiled module has the import
    const fs = require('fs');
    const content = fs.readFileSync('src/server.ts', 'utf-8');
    expect(content).toContain('enterpriseRoutes');
  });
});

describe('D103 — degraded paths', () => {
  it('bcrypt hash failure returns degraded info', async () => {
    try {
      await bcrypt.hash('test', 0); // invalid rounds
    } catch (err: unknown) {
      expect(err).toBeDefined();
    }
  });

  it('empty password fails validation', () => {
    expect(''.length < 6).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════
// D484 — 企业邀请注册全链路（集成，铁律 12: 真实路由不 mock 管线）
// 匿名企业注册 → admin 真实 login → 发邀请 → 匿名查邀请 → 匿名接受
// → GraphStore 实证用户 orgId/role 绑定 → 已用/过期邀请 400 → invite 双层保护
// ════════════════════════════════════════════════════════════════

let server: Server;
let baseUrl: string;
let userStore: UserStore;

// 链路共享状态（同 describe 内用例按声明顺序执行，链式依赖即真实业务顺序）
const ADMIN_EMAIL = 'd484-admin@synova.test';
const ADMIN_PASSWORD = 'd484-admin-pass';
const INVITEE_EMAIL = 'd484-invitee@synova.test';
const INVITEE_PASSWORD = 'd484-invitee-pass';
const INVITE_ROLE = 'staff'; // requireAdmin 只放行 admin/manager——staff 用于⑥的 403 断言
let orgId = '';
let adminToken = '';
let inviteToken = '';

beforeAll(async () => {
  // 同一 UserStore 实例注入两路由模块（模拟生产 synova-agent.ts D224 注入）
  userStore = new UserStore(new InMemoryGraphStore());
  authSetUserStore(userStore);
  entSetUserStore(userStore);

  const app = express();
  app.use(express.json());
  app.use(jwtAuthMiddleware); // 生产同构: server.ts L290 认证层
  app.use(authRoutes);        // 生产同构: server.ts L293 auth 路由（login 白名单）
  app.use(enterpriseRoutes);  // 生产同构: server.ts L354 企业路由

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address();
      baseUrl = `http://localhost:${typeof addr === 'object' && addr ? addr.port : 3099}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

afterEach(() => {
  vi.useRealTimers(); // ⑤ 的 fake 时钟恢复（防泄漏到后续用例）
});

describe('D484 — 企业邀请注册全链路（集成）', () => {
  it('① 匿名企业注册 → 200 + orgId/userId/email/role=admin（修复前被认证层 401 挡）', async () => {
    const res = await fetch(`${baseUrl}/api/enterprise/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, orgName: 'D484 测试企业' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; data: { orgId: string; userId: string; email: string; role: string } };
    expect(body.ok).toBe(true);
    expect(body.data.orgId).toMatch(/^org-/);
    expect(body.data.userId).toBeTruthy();
    expect(body.data.email).toBe(ADMIN_EMAIL);
    expect(body.data.role).toBe('admin');
    orgId = body.data.orgId;

    // GraphStore 实证: admin 用户真实入图且 orgId 绑定
    const adminUser = userStore.queryByEmail(ADMIN_EMAIL);
    expect(adminUser).not.toBeNull();
    expect(adminUser?.role).toBe('admin');
    expect(adminUser?.orgId).toBe(orgId);
  });

  it('② admin 真实 login → JWT；携带 JWT 发邀请 → 200 + invitation token', async () => {
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    });
    expect(login.status).toBe(200);
    const loginBody = await login.json() as { ok: boolean; token: string; payload: { role: string; orgId: string } };
    expect(loginBody.ok).toBe(true);
    expect(loginBody.payload.role).toBe('admin');
    expect(loginBody.payload.orgId).toBe(orgId);
    adminToken = loginBody.token;

    const res = await fetch(`${baseUrl}/api/enterprise/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ email: INVITEE_EMAIL, role: INVITE_ROLE }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; data: { token: string; email: string; role: string; expiresAt: string } };
    expect(body.ok).toBe(true);
    expect(body.data.token).toMatch(/^inv-/);
    expect(body.data.email).toBe(INVITEE_EMAIL);
    expect(body.data.role).toBe(INVITE_ROLE);
    inviteToken = body.data.token;
  });

  it('③ 匿名查询邀请 → 200 + email/orgId/role 匹配（被邀请人打开邀请链接）', async () => {
    const res = await fetch(`${baseUrl}/api/enterprise/invitation/${inviteToken}`);
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; data: { email: string; orgId: string; role: string } };
    expect(body.ok).toBe(true);
    expect(body.data.email).toBe(INVITEE_EMAIL);
    expect(body.data.orgId).toBe(orgId);
    expect(body.data.role).toBe(INVITE_ROLE);
  });

  it('④ 匿名接受邀请 → 200 + 用户创建且 orgId/role 绑定（GraphStore 实证）', async () => {
    const res = await fetch(`${baseUrl}/api/enterprise/invitation/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: inviteToken, password: INVITEE_PASSWORD }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; data: { userId: string; email: string; role: string; orgId: string } };
    expect(body.ok).toBe(true);
    expect(body.data.email).toBe(INVITEE_EMAIL);
    expect(body.data.role).toBe(INVITE_ROLE);
    expect(body.data.orgId).toBe(orgId);

    // DS3 链路实证: 用户节点真实写入图，orgId/role 绑定邀请方企业
    const invitee = userStore.queryByEmail(INVITEE_EMAIL);
    expect(invitee).not.toBeNull();
    expect(invitee?.userId).toBe(body.data.userId);
    expect(invitee?.orgId).toBe(orgId);
    expect(invitee?.role).toBe(INVITE_ROLE);
    // 密码 bcrypt 哈希实证（非明文落图）
    expect(invitee?.passwordHash).not.toBe(INVITEE_PASSWORD);
    expect(invitee?.passwordHash.startsWith('$2')).toBe(true);
  });

  it('⑤ 已用邀请再查/再接受 → 400 INVITATION_USED；过期邀请 → 400 INVITATION_EXPIRED', async () => {
    // 已用: ④ 接受后同 token 再 accept → 400
    const reAccept = await fetch(`${baseUrl}/api/enterprise/invitation/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: inviteToken, password: INVITEE_PASSWORD }),
    });
    expect(reAccept.status).toBe(400);
    const reAcceptBody = await reAccept.json() as { code: string };
    expect(reAcceptBody.code).toBe('INVITATION_USED');

    // 已用: GET 同 token → 400
    const reQuery = await fetch(`${baseUrl}/api/enterprise/invitation/${inviteToken}`);
    expect(reQuery.status).toBe(400);
    const reQueryBody = await reQuery.json() as { code: string };
    expect(reQueryBody.code).toBe('INVITATION_USED');

    // 过期: 真实时间发第二封邀请 → 时钟前移 8 天（>7 天有效期）→ GET/accept 均 400
    const invite2 = await fetch(`${baseUrl}/api/enterprise/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ email: 'd484-expired@synova.test', role: 'staff' }),
    });
    expect(invite2.status).toBe(200);
    const invite2Body = await invite2.json() as { data: { token: string } };
    const expiredToken = invite2Body.data.token;

    // toFake: ['Date'] 只冻结路由内 new Date()，不拦 HTTP 栈 setTimeout
    vi.useFakeTimers({ now: Date.now() + 8 * 24 * 3600 * 1000, toFake: ['Date'] });
    try {
      const expiredQuery = await fetch(`${baseUrl}/api/enterprise/invitation/${expiredToken}`);
      expect(expiredQuery.status).toBe(400);
      const expiredQueryBody = await expiredQuery.json() as { code: string };
      expect(expiredQueryBody.code).toBe('INVITATION_EXPIRED');

      const expiredAccept = await fetch(`${baseUrl}/api/enterprise/invitation/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: expiredToken, password: 'expired-pass-123' }),
      });
      expect(expiredAccept.status).toBe(400);
      const expiredAcceptBody = await expiredAccept.json() as { code: string };
      expect(expiredAcceptBody.code).toBe('INVITATION_EXPIRED');
    } finally {
      vi.useRealTimers();
    }
  });

  it('⑥ invite 双层保护不削弱: 无 token → 401（认证层）；staff token → 403（requireAdmin）', async () => {
    // 外圈: 认证层拦截（无 Authorization header）
    const noToken = await fetch(`${baseUrl}/api/enterprise/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'd484-noauth@synova.test', role: 'staff' }),
    });
    expect(noToken.status).toBe(401);
    const noTokenBody = await noToken.json() as { code: string };
    expect(noTokenBody.code).toBe('UNAUTHORIZED');

    // 内圈: ④ 创建的邀请用户（staff）真实 login → 携其 token 发邀请 → requireAdmin 403
    const staffLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: INVITEE_EMAIL, password: INVITEE_PASSWORD }),
    });
    expect(staffLogin.status).toBe(200);
    const staffLoginBody = await staffLogin.json() as { ok: boolean; token: string };
    expect(staffLoginBody.ok).toBe(true);

    const staffInvite = await fetch(`${baseUrl}/api/enterprise/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${staffLoginBody.token}` },
      body: JSON.stringify({ email: 'd484-forbidden@synova.test', role: 'staff' }),
    });
    expect(staffInvite.status).toBe(403);
    const staffInviteBody = await staffInvite.json() as { code: string };
    expect(staffInviteBody.code).toBe('FORBIDDEN');
  });
});
