/**
 * tests/middleware/rbac-ga-boundary.test.ts — D239 GA 权限边界
 *
 * 覆盖: 冻结/合同过期/部门范围/敏感度/canDownload/审计/默认值/freeze API
 * 约束: ≥8测试 / 零as any
 */
import { describe, it, expect } from 'vitest';
import {
  canAccessWorkspace, canModifyWorkspace, canDownloadRawData,
  isGaFrozen, isGaContractExpired, canGaAccessDept, canGaAccessSensitivity,
  auditGaAccess, type RbacContext, type GAConstraints,
} from '../../src/middleware/rbac';

function gaCtx(overrides: Partial<GAConstraints> = {}): RbacContext {
  return { role: 'ga', userId: 'ga-1', gaConstraints: { isFrozen: false, ...overrides } };
}

describe('D239 — GA 冻结检查', () => {
  it('isFrozen=true → canAccessWorkspace false', () => {
    const ctx = gaCtx({ isFrozen: true });
    expect(canAccessWorkspace(ctx, {})).toBe(false);
  });

  it('isFrozen=false → 通过检查', () => {
    const ctx = gaCtx({ isFrozen: false });
    expect(canAccessWorkspace(ctx, {})).toBe(true);
  });

  it('非GA角色不受 isFrozen 影响', () => {
    const ctx: RbacContext = { role: 'admin', userId: 'admin-1' };
    expect(isGaFrozen(ctx)).toBe(false);
  });
});

describe('D239 — GA 合同过期检查', () => {
  it('过期合同 → canAccessWorkspace false', () => {
    const ctx = gaCtx({ contractExpiry: '2020-01-01' });
    expect(canAccessWorkspace(ctx, {})).toBe(false);
  });

  it('有效合同 → 通过检查', () => {
    const ctx = gaCtx({ contractExpiry: '2030-01-01' });
    expect(canAccessWorkspace(ctx, {})).toBe(true);
  });
});

describe('D239 — GA 部门范围检查', () => {
  it('deptScope 外的部门 → false', () => {
    const ctx = gaCtx({ deptScope: ['dept-a', 'dept-b'] });
    expect(canGaAccessDept(ctx, 'dept-c')).toBe(false);
  });

  it('deptScope 内的部门 → true', () => {
    const ctx = gaCtx({ deptScope: ['dept-a'] });
    expect(canGaAccessDept(ctx, 'dept-a')).toBe(true);
  });
});

describe('D239 — GA 敏感度检查', () => {
  it('S2数据 + S1上限 → false', () => {
    const ctx = gaCtx({ sensitivityCeiling: 'S1' });
    expect(canGaAccessSensitivity(ctx, 'S2')).toBe(false);
  });

  it('S1数据 + S1上限 → true', () => {
    const ctx = gaCtx({ sensitivityCeiling: 'S1' });
    expect(canGaAccessSensitivity(ctx, 'S1')).toBe(true);
  });
});

describe('D239 — canDownloadRawData', () => {
  it('GA canDownload 默认 false', () => {
    const ctx = gaCtx({});
    expect(canDownloadRawData(ctx)).toBe(false);
  });

  it('GA canDownload=true → true', () => {
    const ctx = gaCtx({ canDownload: true });
    expect(canDownloadRawData(ctx)).toBe(true);
  });

  it('非GA角色 → true', () => {
    const ctx: RbacContext = { role: 'admin', userId: 'admin-1' };
    expect(canDownloadRawData(ctx)).toBe(true);
  });
});

describe('D239 — auditGaAccess', () => {
  it('写入审计记录', () => {
    const ctx = gaCtx();
    let written = false;
    const mockStore = { remember: () => { written = true; return { id: 'audit-1' }; } };
    auditGaAccess(ctx, mockStore, 'view_sensitive', 'report-123');
    expect(written).toBe(true);
  });

  it('非GA角色不写入', () => {
    const ctx: RbacContext = { role: 'admin', userId: 'admin-1' };
    let written = false;
    const mockStore = { remember: () => { written = true; return { id: 'a1' }; } };
    auditGaAccess(ctx, mockStore, 'view', 'r1');
    expect(written).toBe(false);
  });
});
