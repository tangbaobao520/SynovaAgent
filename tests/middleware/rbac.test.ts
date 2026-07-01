import { describe, it, expect } from 'vitest';
import { extractRbacContext, canAccessWorkspace, canModifyWorkspace, type RbacContext } from '../../src/middleware/rbac';

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
    // JWT auth should take priority → role=ga, not admin
    expect(ctx.role).toBe('ga');
    expect(ctx.userId).toBe('ga_001');
  });
});
