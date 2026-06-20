/**
 * middleware/rbac.ts — 工作区三级权限控制 (PRD v1.6 Slice 7)
 *
 * admin:   全局读写 + 所有部门只读 + 创建/分配子工作区
 * manager: 本部门读写 + 不可见全局/其他部门
 * liaison: 全局只读 + 所有部门只读 + 冲突检测
 */
import type { Request, Response, NextFunction } from 'express';

export type WorkspaceRole = 'admin' | 'manager' | 'liaison' | 'staff';

const DEFAULT_ROLE: WorkspaceRole = 'staff';
const DEFAULT_USER = 'dev';

export interface RbacContext {
  role: WorkspaceRole;
  department?: string;
  userId: string;
}

/** 从请求中提取 RBAC 上下文 (Phase 1: token/session 中读取; Phase 2: JWT) */
export function extractRbacContext(req: { headers?: Record<string, unknown>; query?: Record<string, unknown> }): RbacContext {
  const token = String((req.headers?.['x-synova-token'] as string) || (req.query?.token as string) || '');
  // Token 格式: role:department:userId
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
  if (ctx.role === 'admin') return true;
  if (ctx.role === 'liaison') return true; // 对接人可见所有
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
  return false;
}

/** Express 中间件: 注入 rbac 上下文到 req */
export function rbacMiddleware(req: Request, _res: Response, next: NextFunction): void {
  (req as Request & { rbac: RbacContext }).rbac = extractRbacContext(req);
  next();
}
