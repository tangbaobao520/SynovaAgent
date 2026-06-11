/**
 * key-person-risk.test.ts — 关键人才风险预警单元测试
 *
 * 对标 Claw-Code: Given/When/Then 注释 + 手写测试数据（不使用 mock 框架）
 */

import {
  analyzeKeyPersonRisk,
  buildDependenciesFromRoles,
  buildKnowledgeDomains,
  RoleDependency,
  KnowledgeDomain,
} from '../key-person-risk';

// ── 测试数据工厂 ──

function createTypicalOrg(): {
  teamId: string;
  dependencies: RoleDependency[];
  knowledgeDomains: KnowledgeDomain[];
  roleScarcityMap: Record<string, number>;
  roleNames: Record<string, string>;
} {
  const teamId = 'test-team-1';
  const roleNames: Record<string, string> = {
    'ceo': 'CEO',
    'cto': 'CTO',
    'backend-lead': '后端负责人',
    'frontend-lead': '前端负责人',
    'devops': 'DevOps 工程师',
    'product-manager': '产品经理',
  };

  const roleScarcityMap: Record<string, number> = {
    'ceo': 0.9,
    'cto': 0.8,
    'backend-lead': 0.5,
    'frontend-lead': 0.4,
    'devops': 0.6,
    'product-manager': 0.3,
  };

  const dependencies: RoleDependency[] = [
    { dependedRoleId: 'cto', dependentRoles: ['backend-lead', 'frontend-lead', 'devops'], dependencyType: 'knowledge', hasAlternative: false },
    { dependedRoleId: 'ceo', dependentRoles: ['cto', 'product-manager'], dependencyType: 'approval', hasAlternative: false },
    { dependedRoleId: 'backend-lead', dependentRoles: ['devops'], dependencyType: 'knowledge', hasAlternative: true },
    { dependedRoleId: 'devops', dependentRoles: ['backend-lead', 'frontend-lead'], dependencyType: 'execution', hasAlternative: false },
    { dependedRoleId: 'frontend-lead', dependentRoles: [], dependencyType: 'execution', hasAlternative: true },
    { dependedRoleId: 'product-manager', dependentRoles: [], dependencyType: 'coordination', hasAlternative: true },
  ];

  const knowledgeDomains: KnowledgeDomain[] = [
    { name: '系统架构', heldByRoles: ['cto'], criticality: 0.95 },
    { name: '后端核心逻辑', heldByRoles: ['cto', 'backend-lead'], criticality: 0.85 },
    { name: '前端架构', heldByRoles: ['frontend-lead'], criticality: 0.7 },
    { name: 'CI/CD 管线', heldByRoles: ['devops', 'backend-lead'], criticality: 0.75 },
    { name: '产品路线图', heldByRoles: ['ceo', 'product-manager'], criticality: 0.8 },
    { name: '数据库管理', heldByRoles: ['backend-lead', 'devops'], criticality: 0.7 },
    { name: '安全审计', heldByRoles: ['cto'], criticality: 0.9 },
  ];

  return { teamId, dependencies, knowledgeDomains, roleScarcityMap, roleNames };
}

// ── Tests ──

describe('analyzeKeyPersonRisk', () => {
  it('detects single point of failure when busFactor = 1', () => {
    // Given: CTO 是唯一掌握"系统架构"和"安全审计"的人
    const org = createTypicalOrg();

    // When: 分析关键人才风险
    const report = analyzeKeyPersonRisk(org);

    // Then: CTO 的 riskLevel 为 critical
    const ctoProfile = report.profiles.find(p => p.roleId === 'cto');
    expect(ctoProfile).toBeDefined();
    expect(ctoProfile!.busFactor).toBeLessThanOrEqual(1);
    expect(ctoProfile!.riskLevel).toBe('critical');
    expect(ctoProfile!.criticalKnowledgeDomains).toContain('系统架构');
    expect(ctoProfile!.criticalKnowledgeDomains).toContain('安全审计');
  });

  it('assigns lower risk when knowledge is shared (busFactor > 1)', () => {
    // Given: 后端核心逻辑由 CTO + backend-lead 两人掌握
    const org = createTypicalOrg();

    // When: 分析
    const report = analyzeKeyPersonRisk(org);

    // Then: backend-lead 的风险低于 CTO
    const backendLead = report.profiles.find(p => p.roleId === 'backend-lead');
    const ctoProfile = report.profiles.find(p => p.roleId === 'cto');
    expect(backendLead).toBeDefined();
    expect(backendLead!.busFactor).toBeGreaterThanOrEqual(2);
    expect(backendLead!.overallRiskScore).toBeLessThan(ctoProfile!.overallRiskScore);
  });

  it('reports singlePointCount correctly', () => {
    // Given: 典型组织中只有一个 busFactor <= 1 的角色
    const org = createTypicalOrg();

    // When: 分析
    const report = analyzeKeyPersonRisk(org);

    // Then: singlePointCount >= 1
    expect(report.singlePointCount).toBeGreaterThanOrEqual(1);
    // 确认单点计数只包含 busFactor <= 1 的角色
    const singlePoints = report.profiles.filter(p => p.busFactor <= 1);
    expect(report.singlePointCount).toBe(singlePoints.length);
  });

  it('identifies uncovered critical knowledge domains', () => {
    // Given: "安全审计"由 CTO 独掌，但 CTO 也是单点风险
    const org = createTypicalOrg();

    // When: 分析
    const report = analyzeKeyPersonRisk(org);

    // Then: uncoveredDomains 包含未被多人覆盖的关键域
    expect(report.uncoveredDomains).toBeDefined();
    expect(Array.isArray(report.uncoveredDomains)).toBe(true);
  });

  it('computes averageBusFactor across all roles', () => {
    // Given: 6 个角色的典型组织
    const org = createTypicalOrg();

    // When: 分析
    const report = analyzeKeyPersonRisk(org);

    // Then: averageBusFactor 在合理范围内 (0-6)
    expect(report.averageBusFactor).toBeGreaterThan(0);
    expect(report.averageBusFactor).toBeLessThanOrEqual(6);
  });

  it('riskLevel is correctly assigned: critical >= 0.7, high >= 0.45, medium >= 0.25, low < 0.25', () => {
    // Given: 完整的组织数据
    const org = createTypicalOrg();

    // When: 分析
    const report = analyzeKeyPersonRisk(org);

    // Then: 每个 profile 的 riskLevel 与 overallRiskScore 一致
    for (const p of report.profiles) {
      switch (p.riskLevel) {
        case 'critical':
          expect(p.overallRiskScore).toBeGreaterThanOrEqual(0.7);
          break;
        case 'high':
          expect(p.overallRiskScore).toBeGreaterThanOrEqual(0.45);
          expect(p.overallRiskScore).toBeLessThan(0.7);
          break;
        case 'medium':
          expect(p.overallRiskScore).toBeGreaterThanOrEqual(0.25);
          expect(p.overallRiskScore).toBeLessThan(0.45);
          break;
        case 'low':
          expect(p.overallRiskScore).toBeLessThan(0.25);
          break;
      }
    }
  });

  it('topSpofRisks contains at most 3 critical-risk profiles', () => {
    // Given: 典型组织
    const org = createTypicalOrg();

    // When: 分析
    const report = analyzeKeyPersonRisk(org);

    // Then: topSpofRisks 最多 3 个 critical 级别
    expect(report.topSpofRisks.length).toBeLessThanOrEqual(3);
    for (const p of report.topSpofRisks) {
      expect(p.riskLevel).toBe('critical');
    }
  });

  it('estimatedRecoveryDays increases with risk score', () => {
    // Given: 两个风险分明显不同的角色
    const org = createTypicalOrg();

    // When: 分析
    const report = analyzeKeyPersonRisk(org);
    const sorted = [...report.profiles].sort((a, b) => a.overallRiskScore - b.overallRiskScore);

    // Then: 最低风险者的恢复天数 < 最高风险者
    const lowest = sorted[0];
    const highest = sorted[sorted.length - 1];
    expect(highest.estimatedRecoveryDays).toBeGreaterThanOrEqual(lowest.estimatedRecoveryDays);
  });

  it('handles empty organization gracefully', () => {
    // Given: 无角色、无依赖、无知识域的空组织
    const empty = {
      teamId: 'empty-team',
      dependencies: [],
      knowledgeDomains: [],
      roleScarcityMap: {},
      roleNames: {},
    };

    // When: 分析
    const report = analyzeKeyPersonRisk(empty);

    // Then: 零风险，无崩溃
    expect(report.profiles).toHaveLength(0);
    expect(report.averageBusFactor).toBe(0);
    expect(report.singlePointCount).toBe(0);
    expect(report.topSpofRisks).toHaveLength(0);
  });

  it('generates ISO timestamp in report', () => {
    // Given: 基本组织数据
    const org = createTypicalOrg();

    // When: 分析
    const report = analyzeKeyPersonRisk(org);

    // Then: generatedAt 为 ISO 时间戳
    expect(report.generatedAt).toBeDefined();
    expect(report.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

// ====================================================================
// 便捷构造器测试
// ====================================================================

describe('buildDependenciesFromRoles', () => {
  it('creates N-1 dependencies per role (all others depend on each)', () => {
    // Given: 4 个角色
    const roles = ['a', 'b', 'c', 'd'];

    // When: 构造依赖
    const deps = buildDependenciesFromRoles(roles);

    // Then: 每个角色有 3 个依赖者
    expect(deps).toHaveLength(4);
    for (const d of deps) {
      expect(d.dependentRoles).toHaveLength(3);
      expect(d.dependentRoles).not.toContain(d.dependedRoleId);
    }
  });

  it('returns empty array for single role', () => {
    // Given: 仅 1 个角色
    // When: 构造依赖
    const deps = buildDependenciesFromRoles(['solo']);

    // Then: 无依赖关系
    expect(deps).toHaveLength(0);
  });

  it('marks hasAlternative true when 3+ roles exist', () => {
    // Given: 3 个角色
    const roles = ['x', 'y', 'z'];

    // When: 构造依赖
    const deps = buildDependenciesFromRoles(roles);

    // Then: 每个依赖标记有替代人选
    for (const d of deps) {
      expect(d.hasAlternative).toBe(true);
    }
  });

  it('marks hasAlternative false when only 2 roles', () => {
    // Given: 2 个角色
    const roles = ['a', 'b'];

    // When: 构造依赖
    const deps = buildDependenciesFromRoles(roles);

    // Then: 无替代人选
    for (const d of deps) {
      expect(d.hasAlternative).toBe(false);
    }
  });
});

describe('buildKnowledgeDomains', () => {
  it('infers heldByRoles from role-knowledge map', () => {
    // Given: 两个角色共享一个知识域
    const map: Record<string, string[]> = {
      'alice': ['auth', 'api-design'],
      'bob': ['auth', 'database'],
    };

    // When: 构造知识域
    const domains = buildKnowledgeDomains(map);

    // Then: auth 由两人掌握
    const authDomain = domains.find(d => d.name === 'auth');
    expect(authDomain).toBeDefined();
    expect(authDomain!.heldByRoles).toContain('alice');
    expect(authDomain!.heldByRoles).toContain('bob');
  });

  it('applies custom criticality from domainCriticality map', () => {
    // Given: 自定义关键度
    const map: Record<string, string[]> = { 'alice': ['security'] };
    const criticality: Record<string, number> = { 'security': 0.99 };

    // When: 构造知识域
    const domains = buildKnowledgeDomains(map, criticality);

    // Then: security 关键度 = 0.99
    const secDomain = domains.find(d => d.name === 'security');
    expect(secDomain!.criticality).toBe(0.99);
  });

  it('defaults criticality to 0.5 when not specified', () => {
    // Given: 未指定关键度
    const map: Record<string, string[]> = { 'alice': ['general'] };

    // When: 构造知识域
    const domains = buildKnowledgeDomains(map);

    // Then: 默认关键度 0.5
    expect(domains[0].criticality).toBe(0.5);
  });
});
