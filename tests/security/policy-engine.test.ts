/**
 * tests/security/policy-engine.test.ts — PolicyEngine 单元测试
 *
 * 覆盖: 正常允许 / 正常拒绝 / 默认Deny / 自定义规则 / 规则删除 / 边界 / 优先级
 * 要求: ≥8 个测试用例
 */
import { describe, it, expect } from 'vitest';
import { PolicyEngine } from '../../src/security/policy-engine';
import type { AccessRequest, PolicyRule } from '../../src/security/policy-engine';

describe('PolicyEngine', () => {
  const engine = new PolicyEngine();

  // ═══ 正常允许 ═══

  it('admin → S1 → ontology.write → {allow:true}', () => {
    const req: AccessRequest = { role: 'admin', dataLevel: 'S1', soi: 'ontology.write' };
    const result = engine.evaluate(req);
    expect(result.allow).toBe(true);
    expect(result.denyReason).toBeUndefined();
  });

  it('boss → S2 → sentinel.compute → {allow:true}', () => {
    const req: AccessRequest = { role: 'boss', dataLevel: 'S2', soi: 'sentinel.compute' };
    const result = engine.evaluate(req);
    expect(result.allow).toBe(true);
  });

  it('manager → S0 → graph.traverse → {allow:true}', () => {
    const req: AccessRequest = { role: 'manager', dataLevel: 'S0', soi: 'graph.traverse' };
    const result = engine.evaluate(req);
    expect(result.allow).toBe(true);
  });

  // ═══ 正常拒绝 ═══

  it('ga → S3 → data.export → {allow:false} (GA不能写)', () => {
    const req: AccessRequest = { role: 'ga', dataLevel: 'S3', soi: 'data.export' };
    const result = engine.evaluate(req);
    expect(result.allow).toBe(false);
    expect(result.denyReason).toBeDefined();
    expect(result.denyReason).toContain('deny_ga_write');
  });

  it('staff → S3 → graph.traverse → {allow:false} (staff不能访问S3)', () => {
    const req: AccessRequest = { role: 'staff', dataLevel: 'S3', soi: 'graph.traverse' };
    const result = engine.evaluate(req);
    expect(result.allow).toBe(false);
    expect(result.denyReason).toContain('deny_staff_sensitive');
  });

  // ═══ 默认Deny ═══

  it('unknown_role → S0 → 空SOI → {allow:false, denyReason包含deny_default}', () => {
    const req: AccessRequest = { role: 'unknown_role', dataLevel: 'S0', soi: '' };
    const result = engine.evaluate(req);
    expect(result.allow).toBe(false);
    expect(result.denyReason).toContain('deny_default');
  });

  // ═══ GA跨租户隔离 ═══

  it('ga → S1 → ontology.write → {allow:false} (GA不能写)', () => {
    const req: AccessRequest = { role: 'ga', dataLevel: 'S1', soi: 'ontology.write' };
    const result = engine.evaluate(req);
    expect(result.allow).toBe(false);
    expect(result.denyReason).toContain('deny_ga_write');
  });

  // ═══ 边界: manager跨部门 ═══

  it('manager → S3 → graph.traverse → {allow:false} (manager不能访问S3)', () => {
    const req: AccessRequest = { role: 'manager', dataLevel: 'S3', soi: 'graph.traverse' };
    const result = engine.evaluate(req);
    expect(result.allow).toBe(false);
    expect(result.denyReason).toContain('deny_default');
  });

  // ═══ 读操作: liaison ✅ / ga ✅ / staff ✅ ═══

  it('liaison → S2 → diagnosis.report → {allow:true} (liaison可读)', () => {
    const req: AccessRequest = { role: 'liaison', dataLevel: 'S2', soi: 'diagnosis.report' };
    const result = engine.evaluate(req);
    expect(result.allow).toBe(true);
  });

  it('ga → S2 → diagnosis.report → {allow:true} (GA可读S0-S2)', () => {
    const req: AccessRequest = { role: 'ga', dataLevel: 'S2', soi: 'diagnosis.report' };
    const result = engine.evaluate(req);
    expect(result.allow).toBe(true);
  });

  // ═══ 边界: GA可读但不能S3 ═══

  it('ga → S3 → diagnosis.report → {allow:false} (GA可读仅限于S0-S2)', () => {
    const req: AccessRequest = { role: 'ga', dataLevel: 'S3', soi: 'diagnosis.report' };
    const result = engine.evaluate(req);
    expect(result.allow).toBe(false);
    expect(result.denyReason).toContain('deny_default');
  });

  // ═══ staff 自己数据 ═══

  it('staff → S1 → diagnosis.report → {allow:true} (staff可访问S0-S1)', () => {
    const req: AccessRequest = { role: 'staff', dataLevel: 'S1', soi: 'diagnosis.report' };
    const result = engine.evaluate(req);
    expect(result.allow).toBe(true);
    expect(result.denyReason).toBeUndefined();
  });

  // ═══ 自定义规则 ═══

  it('addRule — 新规则覆盖内置规则 (higher priority)', () => {
    const customEngine = new PolicyEngine();
    // 添加高优先级规则: boss → S4 → data.export → deny
    const denyBossExport: PolicyRule = {
      name: 'deny_boss_export',
      priority: 1,
      match: { roles: ['boss'], sois: ['data.export'] },
      decision: 'deny',
    };
    customEngine.addRule(denyBossExport);

    const req: AccessRequest = { role: 'boss', dataLevel: 'S4', soi: 'data.export' };
    const result = customEngine.evaluate(req);
    expect(result.allow).toBe(false);
    expect(result.denyReason).toContain('deny_boss_export');
  });

  // ═══ 规则删除 ═══

  it('removeRule — 删除后回退到默认Deny', () => {
    const customEngine = new PolicyEngine();
    // 移除 allow_admin_all → admin应该被默认Deny
    customEngine.removeRule('allow_admin_all');

    const req: AccessRequest = { role: 'admin', dataLevel: 'S1', soi: 'ontology.write' };
    const result = customEngine.evaluate(req);
    expect(result.allow).toBe(false);
    expect(result.denyReason).toContain('deny_default');
  });

  it('removeRule — 不存在的规则返回false', () => {
    const result = engine.removeRule('nonexistent_rule');
    expect(result).toBe(false);
  });

  // ═══ 优先级验证 ═══

  it('deny规则(priority=1)优先于allow规则(priority=3)', () => {
    const customEngine = new PolicyEngine();
    // remove allow_admin_all (priority=3用deny_ga_write替代)
    // verify ga写操作被拒绝（deny_ga_write priority=1）
    const req: AccessRequest = { role: 'ga', dataLevel: 'S1', soi: 'ontology.write' };
    const result = customEngine.evaluate(req);
    expect(result.allow).toBe(false); // deny_ga_write (priority=1) 优先于 allow_ga_read (priority=6)
    expect(result.denyReason).toContain('deny_ga_write');
  });

  // ═══ 异常安全 ═══

  it('异常场景不抛出 — 返回默认Deny', () => {
    const result = engine.evaluate({} as AccessRequest);
    expect(result.allow).toBe(false);
    // {} 不符合任何规则 → deny_default
  });
});
