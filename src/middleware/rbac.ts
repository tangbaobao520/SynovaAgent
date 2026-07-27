/**
 * middleware/rbac.ts — 权限控制 + GA 权限边界 (D239)
 *
 * admin:   全局读写 + 所有部门只读 + 创建/分配子工作区
 * manager: 本部门读写 + 不可见全局/其他部门
 * liaison: 全局只读 + 所有部门只读 + 冲突检测
 * ga:      Growth Advisor — 受约束的只读访问（D239 新增权限边界）
 */
import type { Request, Response, NextFunction } from 'express';
import { createLogger } from '@synova/logger';

const log = createLogger('middleware/rbac');

export type WorkspaceRole = 'admin' | 'manager' | 'liaison' | 'staff' | 'ga';

const DEFAULT_ROLE: WorkspaceRole = 'staff';
const DEFAULT_USER = 'dev';

// ═══ D239: GA 约束 ═══

export interface GAConstraints {
  isFrozen?: boolean;
  deptScope?: string[];
  sensitivityCeiling?: string;
  contractExpiry?: string;
  canDownload?: boolean;
  frozenAt?: string;
}

export interface RbacContext {
  role: WorkspaceRole;
  department?: string;
  userId: string;
  /** D239: GA 约束（仅 ga role 有效） */
  gaConstraints?: GAConstraints;
}

/** 从请求中提取 RBAC 上下文 */
export function extractRbacContext(req: {
  headers?: Record<string, unknown>;
  query?: Record<string, unknown>;
  auth?: { sub: string; role: string; orgId: string; gaConstraints?: GAConstraints };
}): RbacContext {
  if (req.auth) {
    return {
      role: req.auth.role as WorkspaceRole,
      department: undefined,
      userId: req.auth.sub,
      gaConstraints: req.auth.gaConstraints,
    };
  }
  const token = String((req.headers?.['x-synova-token'] as string) || (req.query?.token as string) || '');
  if (token && token.includes(':')) {
    const parts = token.split(':');
    return {
      role: (parts[0] as WorkspaceRole) || DEFAULT_ROLE,
      department: parts[1] || undefined,
      userId: parts[2] || DEFAULT_USER,
    };
  }
  return { role: 'admin', userId: DEFAULT_USER };
}

// ═══ D239: GA 检查链 ═══

/**
 * 检查 GA 是否被冻结（最高优先级）。
 */
export function isGaFrozen(ctx: RbacContext): boolean {
  if (ctx.role !== 'ga') return false;
  return ctx.gaConstraints?.isFrozen === true;
}

/**
 * 检查 GA 合同是否过期。
 */
export function isGaContractExpired(ctx: RbacContext): boolean {
  if (ctx.role !== 'ga' || !ctx.gaConstraints?.contractExpiry) return false;
  return new Date(ctx.gaConstraints.contractExpiry) < new Date();
}

/**
 * 检查 GA 是否能访问指定部门的资源。
 */
export function canGaAccessDept(ctx: RbacContext, deptId: string): boolean {
  if (ctx.role !== 'ga') return true;
  const scope = ctx.gaConstraints?.deptScope;
  if (!scope || scope.length === 0) return true; // 无限制
  return scope.includes(deptId);
}

/**
 * 检查 GA 能否访问指定敏感度的数据。
 */
export function canGaAccessSensitivity(ctx: RbacContext, sensitivity: string): boolean {
  if (ctx.role !== 'ga') return true;
  const ceiling = ctx.gaConstraints?.sensitivityCeiling || 'S1';
  const levels = ['S0', 'S1', 'S2', 'S3', 'S4'];
  return levels.indexOf(sensitivity) <= levels.indexOf(ceiling);
}

/**
 * 检查 GA 是否可以下载原始数据。
 */
export function canDownloadRawData(ctx: RbacContext): boolean {
  if (ctx.role !== 'ga') return true;
  return ctx.gaConstraints?.canDownload === true;
}

/**
 * 记录 GA 敏感数据访问审计。
 */
export function auditGaAccess(
  ctx: RbacContext,
  store: { remember: (entry: Record<string, unknown>) => { id: string } },
  action: string,
  target: string,
): void {
  if (ctx.role !== 'ga') return;
  try {
    store.remember({
      orgId: 'synova',
      key: `ga_audit:${ctx.userId}:${Date.now()}`,
      value: JSON.stringify({
        userId: ctx.userId,
        action,
        target,
        timestamp: new Date().toISOString(),
      }),
      type: 'ga_audit',
      confidence: 1.0,
      source: `ga:${ctx.userId}`,
      tags: ['ga_audit', action],
      expiresAt: null,
    });
    log.info({ userId: ctx.userId, action, target }, 'GA 审计已记录');
  } catch (err) {
    log.warn({ err }, 'GA 审计写入失败 — 降级');
  }
}

/** 检查用户是否可访问指定工作区 */
export function canAccessWorkspace(ctx: RbacContext, ws: {
  visibility?: 'global' | 'department' | 'private';
  department?: string;
  owner?: string;
  sensitivity?: string;
}): boolean {
  // D239: GA 冻结检查（最高优先级）
  if (isGaFrozen(ctx)) {
    log.warn({ userId: ctx.userId }, 'GA 账户已冻结 — 拒绝访问');
    return false;
  }

  // D239: GA 合同过期检查
  if (isGaContractExpired(ctx)) {
    log.warn({ userId: ctx.userId, contractExpiry: ctx.gaConstraints?.contractExpiry }, 'GA 合同已过期 — 拒绝访问');
    return false;
  }

  // D239: GA 部门范围检查
  if (ws.department && !canGaAccessDept(ctx, ws.department)) {
    log.warn({ userId: ctx.userId, department: ws.department }, 'GA 无权访问该部门');
    return false;
  }

  // D239: GA 敏感度检查
  if (ws.sensitivity && !canGaAccessSensitivity(ctx, ws.sensitivity)) {
    log.warn({ userId: ctx.userId, sensitivity: ws.sensitivity }, 'GA 无权访问该敏感度级别');
    return false;
  }

  // 管理员/对接人/GA顾问 — 全部可见（通过约束检查后）
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
  if (role === 'ga') return false;
  return false;
}

/** Express 中间件: 注入 rbac 上下文到 req */
export function rbacMiddleware(req: Request, _res: Response, next: NextFunction): void {
  (req as Request & { rbac: RbacContext }).rbac = extractRbacContext(req);
  next();
}
