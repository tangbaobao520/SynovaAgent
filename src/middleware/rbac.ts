/**
 * middleware/rbac.ts — 工作区权限控制 (PRD v1.6 Slice 7 + Phase 0.1 GA 角色)
 *
 * admin:   全局读写 + 所有部门只读 + 创建/分配子工作区
 * manager: 本部门读写 + 不可见全局/其他部门
 * liaison: 全局只读 + 所有部门只读 + 冲突检测
 * ga:      Growth Advisor — 全局只读 + 不可修改（Phase 0.1 新增）
 */
import type { Request, Response, NextFunction } from 'express';

export type WorkspaceRole = 'admin' | 'manager' | 'liaison' | 'staff' | 'ga';

const DEFAULT_ROLE: WorkspaceRole = 'staff';
const DEFAULT_USER = 'dev';

export interface RbacContext {
  role: WorkspaceRole;
  department?: string;
  userId: string;
}

/** 从请求中提取 RBAC 上下文 (Phase 1: token/session; Phase 2: JWT; Phase 0.1: GA 角色) */
export function extractRbacContext(req: { headers?: Record<string, unknown>; query?: Record<string, unknown>; auth?: { sub: string; role: string; orgId: string } }): RbacContext {
  // Phase 0.1: 优先使用 JWT 中间件注入的 auth
  if (req.auth) {
    return {
      role: req.auth.role as WorkspaceRole,
      department: undefined,
      userId: req.auth.sub,
    };
  }

  // 向下兼容: x-synova-token header (格式: role:department:userId)
  const token = String((req.headers?.['x-synova-token'] as string) || (req.query?.token as string) || '');
  if (token && token.includes(':')) {
    const parts = token.split(':');
    return {
      role: (parts[0] as WorkspaceRole) || DEFAULT_ROLE,
      department: parts[1] || undefined,
      userId: parts[2] || DEFAULT_USER,
    };
  }
  // 默认: admin (开发环境)
  return { role: 'admin', userId: DEFAULT_USER };
}

/** 检查用户是否可访问指定工作区 */
export function canAccessWorkspace(ctx: RbacContext, ws: {
  visibility?: 'global' | 'department' | 'private';
  department?: string;
  owner?: string;
}): boolean {
  // 管理员/对接人/GA顾问 — 全部可见
  if (ctx.role === 'admin' || ctx.role === 'liaison' || ctx.role === 'ga') return true;
  const role = ctx.role as string;
  if (ws.visibility === 'global') return role === 'admin';
  if (ws.visibility === 'private') return ws.owner === ctx.userId || role === 'admin';
  if (ws.visibility === 'department') {
    return ws.department === ctx.department || role === 'admin';
  }
  return false;
}

/** 检查用户是否可修改工作区 */
export function canModifyWorkspace(ctx: RbacContext, ws: {
  visibility?: string;
  department?: string;
  owner?: string;
}): boolean {
  const role = ctx.role as string;
  if (role === 'admin') return true;
  if (role === 'manager') {
    return ws.department === ctx.department || ws.owner === ctx.userId;
  }
  // GA 顾问不可修改（Phase 0.1 新增）
  if (role === 'ga') return false;
  return false;
}

/** Express 中间件: 注入 rbac 上下文到 req */
export function rbacMiddleware(req: Request, _res: Response, next: NextFunction): void {
  (req as Request & { rbac: RbacContext }).rbac = extractRbacContext(req);
  next();
}
