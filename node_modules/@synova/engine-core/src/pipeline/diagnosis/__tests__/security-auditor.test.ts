/**
 * security-auditor.test.ts — A5 安全检查收集器测试
 */
import {
  runSecurityAudit,
  hasBlockingFindings,
  listBuiltinRules,
  type SecurityAuditContext,
} from '../security-auditor';

const baseContext: SecurityAuditContext = {
  orgId: 'org-1',
  teamId: 'team-1',
  activeDataSources: ['system_logs', 'interviews'],
  authorizedScopes: ['system_logs', 'interviews'],
  aggregationThreshold: 3,
};

describe('runSecurityAudit', () => {
  it('passes all checks for compliant context', () => {
    const report = runSecurityAudit(baseContext);
    expect(report.passed).toBeGreaterThan(0);
    expect(report.findings.length).toBeLessThan(report.passed); // more passed than failed
    expect(report.overallRating).toBe('compliant');
  });

  it('generates evidence for each finding', () => {
    const report = runSecurityAudit(baseContext);
    expect(report.evidence.length).toBe(report.findings.length);
    if (report.findings.length > 0) {
      expect(report.evidence[0].source).toBe('module');
      expect(report.evidence[0].moduleId).toBe('security-auditor');
    }
  });

  // L2-001: 未授权数据源
  it('flags unauthorized data sources (L2-001)', () => {
    const ctx: SecurityAuditContext = {
      ...baseContext,
      activeDataSources: ['system_logs', 'interviews', 'financial_data', 'email_scan'],
      authorizedScopes: ['system_logs'],
    };
    const report = runSecurityAudit(ctx);
    const finding = report.findings.find(f => f.ruleId === 'L2-001');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('high');
    expect(finding!.blocking).toBe(true);
  });

  // L2-002: 跨组织隔离
  it('flags missing org ID (L2-002)', () => {
    const ctx: SecurityAuditContext = { ...baseContext, orgId: '' };
    const report = runSecurityAudit(ctx);
    const finding = report.findings.find(f => f.ruleId === 'L2-002');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('critical');
    expect(finding!.blocking).toBe(true);
  });

  // L3-001: 匿名问卷聚合阈值
  it('flags low survey response count (L3-001)', () => {
    const ctx: SecurityAuditContext = {
      ...baseContext,
      surveyResponseCount: 2,
      aggregationThreshold: 5,
    };
    const report = runSecurityAudit(ctx);
    const finding = report.findings.find(f => f.ruleId === 'L3-001');
    expect(finding).toBeDefined();
    expect(finding!.blocking).toBe(true);
  });

  it('passes L3-001 when response count meets threshold', () => {
    const ctx: SecurityAuditContext = {
      ...baseContext,
      surveyResponseCount: 10,
      aggregationThreshold: 3,
    };
    const report = runSecurityAudit(ctx);
    const finding = report.findings.find(f => f.ruleId === 'L3-001');
    expect(finding).toBeUndefined();
  });

  // L1-001: 数据最小化
  it('flags excessive data sources (L1-001)', () => {
    const ctx: SecurityAuditContext = {
      ...baseContext,
      activeDataSources: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
      authorizedScopes: ['a', 'b'],
    };
    const report = runSecurityAudit(ctx);
    const finding = report.findings.find(f => f.ruleId === 'L1-001');
    expect(finding).toBeDefined();
  });

  // L4-001: 版本检查
  it('flags beta engine version (L4-001)', () => {
    const ctx: SecurityAuditContext = { ...baseContext, engineVersion: '2.0.0-beta' };
    const report = runSecurityAudit(ctx);
    const finding = report.findings.find(f => f.ruleId === 'L4-001');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('low');
  });
});

describe('hasBlockingFindings', () => {
  it('returns true when blocking finding exists', () => {
    const ctx: SecurityAuditContext = { ...baseContext, orgId: '' };
    const report = runSecurityAudit(ctx);
    expect(hasBlockingFindings(report)).toBe(true);
  });

  it('returns false when all clear', () => {
    const report = runSecurityAudit(baseContext);
    expect(hasBlockingFindings(report)).toBe(false);
  });
});

describe('overallRating', () => {
  it('reports critical_risk when critical finding exists', () => {
    const ctx: SecurityAuditContext = { ...baseContext, orgId: '' };
    const report = runSecurityAudit(ctx);
    expect(report.overallRating).toBe('critical_risk');
  });

  it('reports at_risk when blocking exists', () => {
    const ctx: SecurityAuditContext = {
      ...baseContext,
      activeDataSources: ['a', 'b', 'c', 'd', 'e', 'f'],
      authorizedScopes: ['a'],
    };
    const report = runSecurityAudit(ctx);
    expect(report.overallRating).toBe('at_risk');
  });
});

describe('listBuiltinRules', () => {
  it('returns all built-in rules', () => {
    const rules = listBuiltinRules();
    expect(rules.length).toBeGreaterThanOrEqual(7);
    expect(rules.every(r => r.id && r.layer && r.severity)).toBe(true);
  });
});
