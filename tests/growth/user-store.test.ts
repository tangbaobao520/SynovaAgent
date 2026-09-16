/**
 * tests/growth/user-store.test.ts — D106 GraphStore 用户持久化
 *
 * 覆盖: createUser / queryByEmail / getById / updateUser / listByOrg
 * 约束: ≥8测试 / 零as any
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { UserStore, type GraphStoreLike } from '../../src/growth/user-store';
import bcrypt from 'bcrypt';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { SqliteGraphStore } from '../../src/adapters/sqlite-graph-store';

// ═══ Mock GraphStore ═══

class MockGraphStore implements GraphStoreLike {
  private nodes = new Map<string, Record<string, unknown>>();
  private counter = 0;

  /** D702: 失败注入开关——置位时 updateNode 抛错（镜像 SqliteGraphStore.updateNode 失败即 throw，src/adapters/sqlite-graph-store.ts:329-333） */
  failUpdates = false;

  createNode(type: string, props: Record<string, unknown>, _graph: string): string {
    // S-15: 镜像真实 createNode（sqlite-graph-store.ts:144）——恒生成 node-<id>，忽略 props.id
    const id = `node-${++this.counter}`;
    this.nodes.set(id, { ...props, _type: type });
    return id;
  }

  queryNodes(type: string, filters?: Record<string, unknown>, _graph?: string): Array<{ id: string; type: string; props: Record<string, unknown> }> {
    const results: Array<{ id: string; type: string; props: Record<string, unknown> }> = [];
    for (const [id, props] of this.nodes) {
      if (props._type !== type) continue;
      if (filters) {
        let match = true;
        for (const [k, v] of Object.entries(filters)) {
          if (props[k] !== v) { match = false; break; }
        }
        if (!match) continue;
      }
      results.push({ id, type, props: { ...props, _type: undefined } as Record<string, unknown> });
    }
    return results;
  }

  getNode(id: string, _graph: string): unknown | null {
    const props = this.nodes.get(id);
    if (!props) return null;
    return { id, type: props._type, props: { ...props, _type: undefined } };
  }

  updateNode(id: string, props: Record<string, unknown>, _graph: string): void {
    if (this.failUpdates) {
      throw new Error('injected update failure (D702)');
    }
    const existing = this.nodes.get(id);
    if (existing) {
      this.nodes.set(id, { ...existing, ...props });
    }
  }
}

describe('D106 — UserStore createUser', () => {
  let store: UserStore;
  beforeEach(() => { store = new UserStore(new MockGraphStore()); });

  it('创建用户返回 userId 和 passwordHash', async () => {
    const result = await store.createUser('alice@co.com', 'securePass1', 'admin', 'org-1');
    expect(result.userId).toBeTruthy();
    expect(result.passwordHash).not.toBe('securePass1'); // hashed
    expect(result.passwordHash.startsWith('$2b$')).toBe(true);
  });

  it('空邮箱抛出异常', async () => {
    await expect(store.createUser('', 'pass123')).rejects.toThrow('email');
  });

  it('短密码抛出异常', async () => {
    await expect(store.createUser('a@b.com', '12345')).rejects.toThrow('密码');
  });
});

describe('D106 — UserStore queryByEmail', () => {
  let store: UserStore;
  beforeEach(async () => {
    store = new UserStore(new MockGraphStore());
    await store.createUser('alice@co.com', 'pass123', 'admin', 'org-1');
    await store.createUser('bob@co.com', 'pass456', 'staff', 'org-2');
  });

  it('按邮箱查询返回用户', () => {
    const user = store.queryByEmail('alice@co.com');
    expect(user).not.toBeNull();
    expect(user!.email).toBe('alice@co.com');
    expect(user!.role).toBe('admin');
    expect(user!.orgId).toBe('org-1');
  });

  it('查询不存在邮箱返回 null', () => {
    const user = store.queryByEmail('nonexistent@co.com');
    expect(user).toBeNull();
  });

  it('空邮箱返回 null', () => {
    expect(store.queryByEmail('')).toBeNull();
  });
});

describe('D106 — UserStore getById / update / list', () => {
  let store: UserStore;
  let userId: string;
  beforeEach(async () => {
    store = new UserStore(new MockGraphStore());
    const result = await store.createUser('alice@co.com', 'pass123', 'admin', 'org-1');
    userId = result.userId;
  });

  it('getById 返回用户', () => {
    const user = store.getById(userId);
    expect(user).not.toBeNull();
    expect(user!.email).toBe('alice@co.com');
  });

  it('updateUser 更新角色', () => {
    store.updateUser(userId, { role: 'manager' });
    const user = store.getById(userId);
    expect(user!.role).toBe('manager');
  });

  it('updateUser 更新状态', () => {
    store.updateUser(userId, { status: 'disabled' });
    const user = store.getById(userId);
    expect(user!.status).toBe('disabled');
  });

  it('listByOrg 返回企业成员', async () => {
    await store.createUser('bob@co.com', 'pass456', 'staff', 'org-1');
    const members = store.listByOrg('org-1');
    expect(members).toHaveLength(2);
    const members2 = store.listByOrg('org-other');
    expect(members2).toHaveLength(0);
  });
});

describe('D107 — ontology USER mapping', () => {
  it('SOGNodeType.USER exists in sog-core-schema', () => {
    const content = require('fs').readFileSync('packages/sog-core/src/sog-core-schema.ts', 'utf-8');
    expect(content).toContain('USER');
    expect(content).toContain('HAS_ACCESS_TO');
  });

  it('UserStore creates USER node type', async () => {
    const mock = new MockGraphStore();
    const store = new UserStore(mock);
    await store.createUser('test@co.com', 'pass123');
    // Verify node was created with type
    const results = mock.queryNodes('USER');
    expect(results).toHaveLength(1);
    expect(results[0].props.email).toBe('test@co.com');
  });
});

// ════════════════════════════════════════════════════════════════
// D702 — 写操作吞错修复（K3 W-2）：updateUser/deleteUser 返 {ok,error}
// RED 契约: 修复前 updateUser 返 void——result.ok 为 undefined → 断言失败（red 留痕）
// ════════════════════════════════════════════════════════════════

describe('D702 — updateUser 返回 {ok,error}', () => {
  let store: UserStore;
  let mock: MockGraphStore;
  let userId: string;
  beforeEach(async () => {
    mock = new MockGraphStore();
    store = new UserStore(mock);
    const result = await store.createUser('d702@co.com', 'pass123', 'staff', 'org-1');
    userId = result.userId;
  });

  it('updateUser 成功 → { ok: true } 且更新读回生效', () => {
    const result = store.updateUser(userId, { role: 'manager' });
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
    expect(store.getById(userId)?.role).toBe('manager');
  });

  it('updateNode 抛错（失败注入）→ { ok: false, error } 且原值不被覆盖', () => {
    mock.failUpdates = true;
    const result = store.updateUser(userId, { role: 'manager' });
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
    expect(store.getById(userId)?.role).toBe('staff');
  });
});

describe('D702 — deleteUser 返回 {ok,error}', () => {
  let store: UserStore;
  let mock: MockGraphStore;
  let userId: string;
  beforeEach(async () => {
    mock = new MockGraphStore();
    store = new UserStore(mock);
    const result = await store.createUser('d702-del@co.com', 'pass123', 'staff', 'org-1');
    userId = result.userId;
  });

  it('deleteUser 成功 → { ok: true } 且 status=disabled 读回', () => {
    const result = store.deleteUser(userId);
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
    expect(store.getById(userId)?.status).toBe('disabled');
  });

  it('deleteUser updateNode 抛错 → { ok: false, error } 且 status 仍 active', () => {
    mock.failUpdates = true;
    const result = store.deleteUser(userId);
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
    expect(store.getById(userId)?.status).toBe('active');
  });
});

// ════════════════════════════════════════════════════════════════
// D702 S-15 — 真实依赖 round-trip（SqliteGraphStore 真库，非 mock）
// 真实失败源: 连接 B 持有 EXCLUSIVE 写锁 → 连接 A 的 UPDATE SQLITE_BUSY →
// SqliteGraphStore.updateNode 按生产语义 throw（sqlite-graph-store.ts:329-333）
// → UserStore 必须 { ok:false, error }；成功路径必须真库读回可见。
// ════════════════════════════════════════════════════════════════

describe('D702 S-15 — 真实 SQLite round-trip', () => {
  it('updateUser orgId 真库读回可见；真实写锁冲突 → { ok:false, error } 且读回不可见', async () => {
    const dbPath = path.join(os.tmpdir(), `d702-s15-${process.pid}-${Date.now()}.db`);
    const db = new Database(dbPath, { timeout: 50 });
    const blocker = new Database(dbPath, { timeout: 50 });
    const realStore = new SqliteGraphStore(db);
    const store = new UserStore(realStore);
    try {
      const created = await store.createUser('s15@co.com', 'pass123', 'staff', 'org-default');
      // S-15: 真实 createNode id 语义——恒生成 node-<uuid>，忽略 props.id
      expect(created.userId.startsWith('node-')).toBe(true);

      // 写入成功 → 读回可见（orgId 真库可见 + listByOrg 归属新组织）
      const okResult = store.updateUser(created.userId, { orgId: 'org-s15' });
      expect(okResult.ok).toBe(true);
      expect(store.queryByEmail('s15@co.com')?.orgId).toBe('org-s15');
      expect(store.listByOrg('org-s15').some(u => u.userId === created.userId)).toBe(true);

      // 注入真实失败: 连接 B 持 EXCLUSIVE 写锁 → A 的 UPDATE SQLITE_BUSY → throw → {ok:false}
      blocker.exec('BEGIN EXCLUSIVE');
      blocker.exec('CREATE TABLE d702_lock (x INTEGER)');
      const failResult = store.updateUser(created.userId, { orgId: 'org-never' });
      expect(failResult.ok).toBe(false);
      expect(failResult.error).toBeTruthy();

      // 读回不可见: 失败的 orgId 未落库（旧值 org-s15 仍在，org-never 查不到）
      expect(store.queryByEmail('s15@co.com')?.orgId).toBe('org-s15');
      expect(store.listByOrg('org-never')).toHaveLength(0);
    } finally {
      try { blocker.exec('ROLLBACK'); } catch { /* 事务可能已回滚 */ }
      blocker.close();
      db.close();
      fs.rmSync(dbPath, { force: true });
      fs.rmSync(`${dbPath}-wal`, { force: true });
      fs.rmSync(`${dbPath}-shm`, { force: true });
    }
  });
});
