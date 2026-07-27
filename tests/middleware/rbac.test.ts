import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { extractRbacContext, canAccessWorkspace, canModifyWorkspace, derivePermissions, BUILTIN_TEMPLATES, type RbacContext } from '../../src/middleware/rbac';
import { listTemplates, getTemplate, saveTemplate, deleteTemplate } from '../../src/services/role-template-store';
import { unlinkSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

function mockReq(token: string): Record<string, unknown> {
  return { headers: { 'x-synova-token': token }, query: {} };
}

describe('extractRbacContext', () => {
  it('admin token → role=admin', () => {
    const ctx = extractRbacContext(mockReq('admin::dev') as any);
    expect(ctx.role).toBe('admin');
    expect(ctx.userId).toBe('dev');
  });

  it('manager token with department', () => {
    const ctx = extractRbacContext(mockReq('manager:marketing:alice') as any);
    expect(ctx.role).toBe('manager');
    expect(ctx.department).toBe('marketing');
    expect(ctx.userId).toBe('alice');
  });

  it('liaison token → role=liaison', () => {
    const ctx = extractRbacContext(mockReq('liaison::coordinator') as any);
    expect(ctx.role).toBe('liaison');
  });

  it('empty token → default admin in dev', () => {
    const ctx = extractRbacContext(mockReq('') as any);
    expect(ctx.role).toBe('admin');
  });

  it('token without colon → default admin', () => {
    const ctx = extractRbacContext(mockReq('some-random-token') as any);
    expect(ctx.role).toBe('admin');
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
