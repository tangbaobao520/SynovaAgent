import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { extractRbacContext, canAccessWorkspace, canModifyWorkspace, derivePermissions, BUILTIN_TEMPLATES, type RbacContext } from '../../src/middleware/rbac';
import { listTemplates, getTemplate, saveTemplate, deleteTemplate } from '../../src/services/role-template-store';
import { unlinkSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

/**
 * D947 夹具请求构造——只带自报 x-synova-token（无 req.auth）。
 * 返回类型与 extractRbacContext 入参结构一致，不需要 any/never 断言。
 */
function mockReq(token: string) {
  return { headers: { 'x-synova-token': token }, query: {} as Record<string, unknown> };
}

/**
 * D947 PR-1 / P0+P1: 默认安全姿态——自报凭据（x-synova-token / query.token）
 * 不经验签，**一律不放行**；无凭据时标记未认证，绝不回退 admin。
 *
 * 修复前行为（rbac.ts:110-119）: 任一带 ':' 的字符串即可自封 role=admin；
 * 无凭据时兜底 `{ role: 'admin' }`。以下用例在修复前为红/为"放行"，修复后为绿/为"拒绝"。
 */
describe('extractRbacContext — D947 默认安全姿态', () => {
  it('P0: x-synova-token=admin::dev 自报 → 角色 ≠ admin 且标记未认证', () => {
    const ctx = extractRbacContext(mockReq('admin::dev'));
    expect(ctx.role).not.toBe('admin');
    expect(ctx.authenticated).toBe(false);
  });

  it('P0: query.token=admin::x 自报 → 角色 ≠ admin（query 自报同样不放行）', () => {
    const ctx = extractRbacContext({ headers: {}, query: { token: 'admin::x' } });
    expect(ctx.role).not.toBe('admin');
    expect(ctx.authenticated).toBe(false);
  });

  it('P0: manager:marketing:alice 自报 → 不解析出 manager/department/alice（越权面归零）', () => {
    const ctx = extractRbacContext(mockReq('manager:marketing:alice'));
    expect(ctx.role).not.toBe('manager');
    expect(ctx.department).toBeUndefined();
    expect(ctx.userId).not.toBe('alice');
  });

  it('P0: liaison::coordinator 自报 → 不解析出 liaison', () => {
    const ctx = extractRbacContext(mockReq('liaison::coordinator'));
    expect(ctx.role).not.toBe('liaison');
    expect(ctx.authenticated).toBe(false);
  });

  it('P1: 空 token → 不得 admin + 标记未认证', () => {
    const ctx = extractRbacContext(mockReq(''));
    expect(ctx.role).not.toBe('admin');
    expect(ctx.authenticated).toBe(false);
  });

  it('P1: 无冒号 token → 不得 admin + 标记未认证', () => {
    const ctx = extractRbacContext(mockReq('some-random-token'));
    expect(ctx.role).not.toBe('admin');
    expect(ctx.authenticated).toBe(false);
  });

  it('P1: 完全无 headers/query → 不得 admin + 标记未认证', () => {
    const ctx = extractRbacContext({});
    expect(ctx.role).not.toBe('admin');
    expect(ctx.authenticated).toBe(false);
  });

  it('P1: 自报 admin 上下文 → canAccessWorkspace(global) 拒绝', () => {
    const ctx = extractRbacContext(mockReq('admin::dev'));
    expect(canAccessWorkspace(ctx, { visibility: 'global' })).toBe(false);
  });

  it('P1: 自报 admin 上下文 → canModifyWorkspace 拒绝', () => {
    const ctx = extractRbacContext(mockReq('admin::dev'));
    expect(canModifyWorkspace(ctx, { visibility: 'global' })).toBe(false);
  });

  it('P1 边界: department 可见但 ws.department 缺失 → 不得因 undefined===undefined 放行', () => {
    const ctx = extractRbacContext(mockReq('admin::dev'));
    expect(canAccessWorkspace(ctx, { visibility: 'department' })).toBe(false);
  });

  it('正常路径: req.auth（验签注入）仍正确提取，且标记已认证', () => {
    const ctx = extractRbacContext({ auth: { sub: 'ga_001', role: 'ga', orgId: 'org-1' } });
    expect(ctx.role).toBe('ga');
    expect(ctx.userId).toBe('ga_001');
    expect(ctx.authenticated).toBe(true);
  });
});

describe('canAccessWorkspace', () => {
  const r = (role: string, dept?: string): RbacContext => ({ role: role as RbacContext['role'], userId: 'u', department: dept });

  it('admin can access all workspaces', () => {
    expect(canAccessWorkspace(r('admin'), { visibility: 'global' })).toBe(true);
    expect(canAccessWorkspace(r('admin'), { visibility: 'department', department: 'marketing' })).toBe(true);
    expect(canAccessWorkspace(r('admin'), { visibility: 'private', owner: 'bob' })).toBe(true);
  });

  it('liaison can access all workspaces', () => {
    expect(canAccessWorkspace(r('liaison'), { visibility: 'global' })).toBe(true);
    expect(canAccessWorkspace(r('liaison'), { visibility: 'department', department: 'sales' })).toBe(true);
    expect(canAccessWorkspace(r('liaison'), { visibility: 'private', owner: 'bob' })).toBe(true);
  });

  it('manager can access own department workspace', () => {
    expect(canAccessWorkspace(r('manager', 'marketing'), { visibility: 'department', department: 'marketing' })).toBe(true);
  });

  it('manager CANNOT access other department workspace', () => {
    expect(canAccessWorkspace(r('manager', 'marketing'), { visibility: 'department', department: 'sales' })).toBe(false);
  });

  it('manager CANNOT access global workspace', () => {
    expect(canAccessWorkspace(r('manager', 'marketing'), { visibility: 'global' })).toBe(false);
  });

  it('manager can access own private workspace', () => {
    expect(canAccessWorkspace(r('manager', 'marketing'), { visibility: 'private', owner: 'u' })).toBe(true);
  });

  it('manager CANNOT access other private workspace', () => {
    expect(canAccessWorkspace(r('manager', 'marketing'), { visibility: 'private', owner: 'bob' })).toBe(false);
  });
});

describe('canModifyWorkspace', () => {
  const r = (role: string, dept?: string): RbacContext => ({ role: role as RbacContext['role'], userId: 'u', department: dept });

  it('admin can modify all', () => {
    expect(canModifyWorkspace(r('admin'), { department: 'sales' })).toBe(true);
  });

  it('manager can modify own department', () => {
    expect(canModifyWorkspace(r('manager', 'marketing'), { department: 'marketing' })).toBe(true);
  });

  it('manager can modify own workspace', () => {
    expect(canModifyWorkspace(r('manager'), { department: 'sales', owner: 'u' })).toBe(true);
  });

  it('manager CANNOT modify other department workspace', () => {
    expect(canModifyWorkspace(r('manager'), { department: 'sales', owner: 'bob' })).toBe(false);
  });

  it('liaison CANNOT modify', () => {
    expect(canModifyWorkspace(r('liaison'), { department: 'marketing' })).toBe(false);
  });

  // ═══ Phase 0.1: GA 角色 ═══

  it('GA token → role=ga', () => {
    const ctx = extractRbacContext({ auth: { sub: 'ga_001', role: 'ga', orgId: 'org-1' } } as any);
    expect(ctx.role).toBe('ga');
    expect(ctx.userId).toBe('ga_001');
  });

  it('GA can access all workspaces (like liaison)', () => {
    expect(canAccessWorkspace(r('ga'), { visibility: 'global' })).toBe(true);
    expect(canAccessWorkspace(r('ga'), { visibility: 'department', department: 'sales' })).toBe(true);
    expect(canAccessWorkspace(r('ga'), { visibility: 'private', owner: 'bob' })).toBe(true);
  });

  it('GA CANNOT modify workspace (403)', () => {
    expect(canModifyWorkspace(r('ga'), { department: 'marketing' })).toBe(false);
    expect(canModifyWorkspace(r('ga'), { department: 'sales', owner: 'ga_001' })).toBe(false);
  });

  it('extractRbacContext: JWT auth takes priority over x-synova-token', () => {
    const ctx = extractRbacContext({
      headers: { 'x-synova-token': 'admin:dev:user1' },
      auth: { sub: 'ga_001', role: 'ga', orgId: 'org-1' },
    } as any);
    expect(ctx.role).toBe('ga');
    expect(ctx.userId).toBe('ga_001');
  });
});

// ═══ D242: 权限模板 ═══

describe('D242 — RoleTemplate builtins', () => {
  it('有 5 个内置模板', () => {
    expect(BUILTIN_TEMPLATES).toHaveLength(5);
    const ids = BUILTIN_TEMPLATES.map(t => t.id);
    expect(ids).toContain('admin');
    expect(ids).toContain('manager');
    expect(ids).toContain('liaison');
    expect(ids).toContain('staff');
    expect(ids).toContain('ga');
  });

  it('内置模板 isBuiltin=true', () => {
    for (const t of BUILTIN_TEMPLATES) {
      expect(t.isBuiltin).toBe(true);
    }
  });

  it('derivePermissions 从模板派生', () => {
    const admin = BUILTIN_TEMPLATES.find(t => t.id === 'admin')!;
    const perms = derivePermissions(admin);
    expect(perms.data).toBe('admin');
    expect(perms.function).toBe('audit');
  });

  it('derivePermissions 支持覆盖', () => {
    const staff = BUILTIN_TEMPLATES.find(t => t.id === 'staff')!;
    const perms = derivePermissions(staff, { data: 'write' });
    expect(perms.data).toBe('write');   // covered
    expect(perms.function).toBe('use');  // from template
    expect(perms.time).toBe('business_hours');  // from template
  });
});

describe('D242 — RoleTemplateStore CRUD', () => {
  const TEST_ID = 'test-custom-role';
  const testTemplate = {
    id: TEST_ID, name: 'Test Role', description: 'A test custom role',
    basedOn: 'staff', permissions: { data: 'read' as const, function: 'use' as const, time: 'unlimited' as const },
    isBuiltin: false, createdAt: new Date().toISOString(),
  };

  afterEach(() => {
    try {
      const p = join(process.cwd(), '.codex', 'settings', 'role-templates', `${TEST_ID}.json`);
      if (existsSync(p)) unlinkSync(p);
    } catch { /* ok */ }
  });

  it('listTemplates 包含 5 个内置', () => {
    const all = listTemplates();
    const builtins = all.filter(t => t.isBuiltin);
    expect(builtins).toHaveLength(5);
  });

  it('saveTemplate + getTemplate CRUD', () => {
    expect(saveTemplate(testTemplate)).toBe(true);
    const loaded = getTemplate(TEST_ID);
    expect(loaded).toBeDefined();
    expect(loaded!.name).toBe('Test Role');
    expect(loaded!.permissions.data).toBe('read');
  });

  it('内置模板不可删除', () => {
    const result = deleteTemplate('admin');
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('不可删除');
  });

  it('自定义模板可删除', () => {
    saveTemplate(testTemplate);
    const result = deleteTemplate(TEST_ID);
    expect(result.ok).toBe(true);
    expect(getTemplate(TEST_ID)).toBeUndefined();
  });

  it('listTemplates 包含已保存的自定义模板', () => {
    saveTemplate(testTemplate);
    const all = listTemplates();
    const custom = all.find(t => t.id === TEST_ID);
    expect(custom).toBeDefined();
    expect(custom!.isBuiltin).toBe(false);
  });
});
