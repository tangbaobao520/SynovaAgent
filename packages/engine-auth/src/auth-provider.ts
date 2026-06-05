/**
 * engine-auth/auth-provider.ts — AuthProvider 接口
 *
 * 所有权限判定的唯一入口。各层通过此接口获取用户信息和过滤条件。
 * 实现类: RBACProvider (rbac.ts), 未来 ABACProvider
 */
import type { UserContext, FilterClause, ResourceRef, PermissionAction } from './types';

export interface AuthProvider {
  /** 从 token 获取用户上下文 (L1 调用) */
  getUserContext(token: string): Promise<UserContext>;

  /** 判断用户是否有权执行某操作 (L2/L3 调用) */
  checkPermission(ctx: UserContext, resource: ResourceRef, action: PermissionAction): Promise<boolean>;

  /** 批量过滤资源 — 从列表中移除无权限的条目 (L3 调用) */
  filterResources<T extends Record<string, unknown>>(
    ctx: UserContext,
    resources: T[],
    action: PermissionAction,
  ): Promise<T[]>;

  /**
   * 生成 L4 过滤条件 (L3 调用)。
   * ⚠️ 所有模块必须通过此接口获取 FilterClause，不得自行构造。
   * 返回空数组 = admin 无条件通过。
   */
  getPermissionFilter(
    ctx: UserContext,
    resourceType: string,
    action: PermissionAction,
  ): Promise<FilterClause>;
}
