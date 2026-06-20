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
});
