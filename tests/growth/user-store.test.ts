/**
 * tests/growth/user-store.test.ts — D106 GraphStore 用户持久化
 *
 * 覆盖: createUser / queryByEmail / getById / updateUser / listByOrg
 * 约束: ≥8测试 / 零as any
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { UserStore, type GraphStoreLike } from '../../src/growth/user-store';
import bcrypt from 'bcrypt';

// ═══ Mock GraphStore ═══

class MockGraphStore implements GraphStoreLike {
  private nodes = new Map<string, Record<string, unknown>>();
  private counter = 0;

  createNode(type: string, props: Record<string, unknown>, _graph: string): string {
    const id = `usr-${++this.counter}`;
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
