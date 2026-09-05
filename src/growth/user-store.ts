/**
 * src/growth/user-store.ts — GraphStore 用户持久化 (D106)
 *
 * 将 D102/D103 的 in-memory Map 替换为 GraphStore 持久化存储。
 * GraphStore 节点类型定义位于 sog-core 中。
 *
 * 铁律 24+31: catch + log.warn + degraded
 * 铁律 38: 零 as any
 */
import { createLogger } from '@synova/logger';
import bcrypt from 'bcrypt';

const log = createLogger('growth/user-store');

// ═══ Types ═══

export interface UserProps {
  email: string;
  passwordHash: string;
  role: 'admin' | 'manager' | 'liaison' | 'staff' | 'ga';
  orgId: string;
  status: 'active' | 'disabled';
  displayName?: string;
  department?: string;
  phone?: string;
  wechatId?: string;
}

export interface UserRecord {
  userId: string;
  email: string;
  passwordHash: string;
  role: string;
  orgId: string;
  status: string;
  displayName?: string;
  department?: string;
  phone?: string;
  wechatId?: string;
  createdAt: string;
}

/** GraphStore 最小接口 */
export interface GraphStoreLike {
  createNode(type: string, props: Record<string, unknown>, graph: string): string;
  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{ id: string; type: string; props: Record<string, unknown> }>;
  getNode(id: string, graph: string): unknown | null;
  updateNode(id: string, props: Record<string, unknown>, graph: string): void;
}

// ═══ Constants ═══

const USER_GRAPH = 'enterprise';
const NODE_TYPE = 'USER';

// ═══ UserStore ═══

export class UserStore {
  private store: GraphStoreLike;

  constructor(store: GraphStoreLike) {
    this.store = store;
  }

  /**
   * 创建用户节点。
   *
   * @param email        - 邮箱（唯一）
   * @param password     - 明文密码（将被 bcrypt hash）
   * @param role         - 角色
   * @param orgId        - 组织 ID
   * @param extra        - 额外属性
   * @returns userId (GraphStore node ID)
   */
  async createUser(
    email: string,
    password: string,
    role: UserProps['role'] = 'staff',
    orgId: string = 'default',
    extra?: { displayName?: string; department?: string; phone?: string; wechatId?: string },
  ): Promise<{ userId: string; passwordHash: string }> {
    if (!email || !password) {
      throw new Error('email 和 password 必填');
    }
    if (password.length < 6) {
      throw new Error('密码至少6位');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    try {
      const userId = this.store.createNode(NODE_TYPE, {
        email,
        passwordHash,
        role,
        orgId,
        status: 'active',
        displayName: extra?.displayName || '',
        department: extra?.department || '',
        phone: extra?.phone || '',
        wechatId: extra?.wechatId || '',
        createdAt: new Date().toISOString(),
      }, USER_GRAPH);

      log.info({ userId, email, orgId }, '用户已创建');
      return { userId, passwordHash };
    } catch (err) {
      log.error({ err, email }, '创建用户失败 — 返回空降级结果');
      return { userId: '', passwordHash: '' };
    }
  }

  /**
   * 按邮箱查询用户。
   *
   * @param email - 邮箱
   * @returns UserRecord 或 null
   */
  queryByEmail(email: string): UserRecord | null {
    if (!email) return null;

    try {
      const results = this.store.queryNodes(NODE_TYPE, { email }, USER_GRAPH);
      if (results.length === 0) return null;

      return this._nodeToRecord(results[0]);
    } catch (err) {
      log.warn({ err, email }, '查询用户失败 — 降级');
      return null;
    }
  }

  /** 节点 → UserRecord */
  private _nodeToRecord(node: { id: string; props: Record<string, unknown> }): UserRecord {
    const p = node.props;
    return {
      userId: node.id,
      email: p.email as string,
      passwordHash: p.passwordHash as string,
      role: p.role as string,
      orgId: p.orgId as string,
      status: p.status as string,
      displayName: p.displayName as string | undefined,
      department: p.department as string | undefined,
      phone: p.phone as string | undefined,
      wechatId: p.wechatId as string | undefined,
      createdAt: p.createdAt as string,
    };
  }

  /**
   * 按手机号查询用户。
   */
  queryByPhone(phone: string): UserRecord | null {
    if (!phone) return null;
    try {
      const results = this.store.queryNodes(NODE_TYPE, { phone }, USER_GRAPH);
      if (results.length === 0) return null;
      return this._nodeToRecord(results[0]);
    } catch (err) {
      log.warn({ err, phone }, '查询用户失败(phone) — 降级');
      return null;
    }
  }

  /**
   * 按微信号查询用户。
   */
  queryByWechatId(wechatId: string): UserRecord | null {
    if (!wechatId) return null;
    try {
      const results = this.store.queryNodes(NODE_TYPE, { wechatId }, USER_GRAPH);
      if (results.length === 0) return null;
      return this._nodeToRecord(results[0]);
    } catch (err) {
      log.warn({ err, wechatId }, '查询用户失败(wechatId) — 降级');
      return null;
    }
  }

  /**
   * 按 userId 查询用户。
   */
  getById(userId: string): UserRecord | null {
    if (!userId) return null;

    try {
      const raw = this.store.getNode(userId, USER_GRAPH) as Record<string, unknown> | null;
      if (!raw) return null;

      const p = raw.props as Record<string, unknown> || {};
      return {
        userId: raw.id as string,
        email: p.email as string,
        passwordHash: p.passwordHash as string,
        role: p.role as string,
        orgId: p.orgId as string,
        status: p.status as string,
        displayName: p.displayName as string | undefined,
        department: p.department as string | undefined,
        phone: p.phone as string | undefined,
        wechatId: p.wechatId as string | undefined,
        createdAt: p.createdAt as string,
      };
    } catch (err) {
      log.warn({ err, userId }, '查询用户失败 — 降级');
      return null;
    }
  }

  /**
   * 更新用户属性。
   *
   * D485: props 扩展含 'orgId'——双轨账号关联（个人账号被邀请加入企业）需要
   * 更新 orgId 完成绑定（userId/密码保留，SqliteGraphStore.updateNode 为通用
   * props merge，orgId 可持久化）。
   */
  updateUser(userId: string, props: Partial<Pick<UserRecord, 'role' | 'status' | 'displayName' | 'department' | 'orgId'>>): void {
    try {
      this.store.updateNode(userId, props as Record<string, unknown>, USER_GRAPH);
      log.info({ userId }, '用户已更新');
    } catch (err) {
      log.warn({ err, userId }, '更新用户失败 — 降级');
    }
  }

  /**
   * 软删除用户（设置 status='disabled'）。
   */
  deleteUser(userId: string): void {
    try {
      this.store.updateNode(userId, { status: 'disabled' } as Record<string, unknown>, USER_GRAPH);
      log.info({ userId }, '用户已停用(软删除)');
    } catch (err) {
      log.warn({ err, userId }, '删除用户失败 — 降级');
    }
  }

  /**
   * 查询所有用户数量。
   */
  getTotalUserCount(): number {
    try {
      return this.store.queryNodes(NODE_TYPE, {}, USER_GRAPH).length;
    } catch (err) {
      log.warn({ err }, '查询用户总数失败 — 降级');
      return 0;
    }
  }

  /**
   * 按 orgId 列出成员。
   */
  listByOrg(orgId: string): UserRecord[] {
    if (!orgId) return [];

    try {
      const results = this.store.queryNodes(NODE_TYPE, { orgId }, USER_GRAPH);
      return results.map(node => this._nodeToRecord(node));
    } catch (err) {
      log.warn({ err, orgId }, '列出成员失败 — 降级');
      return [];
    }
  }
}
