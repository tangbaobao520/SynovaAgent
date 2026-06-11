/**
 * key-person-risk.ts — 关键人才风险预警
 *
 * 对标 Claw-Code recovery_recipes.rs 的场景化故障建模：
 *   - 单点故障识别 (SPOF: Single Point of Failure)
 *   - 离职影响评估
 *   - 知识继承度评分
 *   - 风险优先级排序
 *
 * 风险维度：
 *   - busFactor: 知识被几人掌握（1=只有本人，越高越安全）
 *   - roleScarcity: 角色在市场/组织内的稀缺程度
 *   - dependencyCount: 多少其他角色依赖此人
 *   - criticalKnowledge: 掌握的关键知识占比
 *   - departureImpact: 离职后的恢复时间估计（天）
 */

import { SOGNodeType } from '@synova/sog-core';

// ====================================================================
// 类型定义
// ====================================================================

/** 角色依赖关系 */
export interface RoleDependency {
  /** 被依赖的角色 ID */
  dependedRoleId: string;
  /** 依赖该角色的其他角色 ID 列表 */
  dependentRoles: string[];
  /** 依赖类型 */
  dependencyType: 'knowledge' | 'approval' | 'execution' | 'coordination';
  /** 是否有替代人选 */
  hasAlternative: boolean;
}

/** 知识领域 */
export interface KnowledgeDomain {
  name: string;
  /** 掌握该知识的角色 ID 列表 */
  heldByRoles: string[];
  /** 关键程度 0-1 */
  criticality: number;
}

/** 角色风险画像 */
export interface RoleRiskProfile {
  roleId: string;
  roleName: string;
  /** Bus Factor: 掌握关键知识的人数（含本人） */
  busFactor: number;
  /** 角色稀缺度 0-1（1=极度稀缺） */
  roleScarcity: number;
  /** 依赖此角色的其他角色数 */
  dependencyCount: number;
  /** 掌握的关键知识域列表 */
  criticalKnowledgeDomains: string[];
  /** 综合风险评分 0-1 */
  overallRiskScore: number;
  /** 离职影响：恢复时间估计（天） */
  estimatedRecoveryDays: number;
  /** 风险等级 */
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
}

/** SOG Risk 节点描述符——关联到 Person 节点，供 Risk Aggregator 消费 */
export interface SOGRiskNode {
  /** 关联的 Person 节点 ID（用于在 SOG 图中创建 Risk→Person 关联） */
  personId: string;
  /** SOG 节点类型：Risk（值恒为 SOGNodeType.RISK = 'Risk'） */
  nodeType: SOGNodeType;
  /** 关联的目标节点类型：Person（值恒为 SOGNodeType.PERSON = 'Person'） */
  linkedNodeType: SOGNodeType;
  /** SOG RiskProps.riskType——标识具体风险类别 */
  riskType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'active' | 'mitigated' | 'resolved';
  /** 风险元数据（非 SOG 标准字段，供下游消费） */
  metadata: {
    roleName: string;
    busFactor: number;
    overallRiskScore: number;
    estimatedRecoveryDays: number;
    criticalKnowledgeDomains: string[];
  };
}

/** 团队风险汇总 */
export interface KeyPersonRiskReport {
  teamId: string;
  profiles: RoleRiskProfile[];
  /** 最高单点风险的三个角色 */
  topSpofRisks: RoleRiskProfile[];
  /** 团队平均 Bus Factor */
  averageBusFactor: number;
  /** 有多少个角色 busFactor <= 1 */
  singlePointCount: number;
  /** 关键知识域未覆盖数 */
  uncoveredDomains: string[];
  generatedAt: string;
  /** SOG Risk 节点列表——每个高风险/关键角色生成一个 Risk 节点，链接到对应 Person 节点 */
  sogRiskNodes: SOGRiskNode[];
}

// ====================================================================
// 风险分计算
// ====================================================================

const RISK_WEIGHTS = {
  busFactor: 0.35,        // Bus Factor 是最重要维度
  roleScarcity: 0.20,
  dependencyCount: 0.25,
  knowledgeCriticality: 0.20,
} as const;

/** 加权计算综合风险分 */
function computeOverallRiskScore(params: {
  busFactor: number;
  roleScarcity: number;
  dependencyCount: number;
  knowledgeCriticalityAvg: number;
  maxDependencyCount: number;
}): number {
  const busFactorScore = params.busFactor <= 0 ? 1 : Math.max(0, 1 - params.busFactor / 5);
  const depScore = params.maxDependencyCount > 0
    ? params.dependencyCount / params.maxDependencyCount
    : 0;

  return (
    RISK_WEIGHTS.busFactor * busFactorScore +
    RISK_WEIGHTS.roleScarcity * params.roleScarcity +
    RISK_WEIGHTS.dependencyCount * depScore +
    RISK_WEIGHTS.knowledgeCriticality * params.knowledgeCriticalityAvg
  );
}

// ====================================================================
// 主分析函数
// ====================================================================

export function analyzeKeyPersonRisk(params: {
  teamId: string;
  dependencies: RoleDependency[];
  knowledgeDomains: KnowledgeDomain[];
  roleScarcityMap: Record<string, number>;
  roleNames: Record<string, string>;
}): KeyPersonRiskReport {
  const { teamId, dependencies, knowledgeDomains, roleScarcityMap, roleNames } = params;

  // 收集所有出现过的角色 ID
  const allRoleIds = new Set<string>();
  for (const d of dependencies) {
    allRoleIds.add(d.dependedRoleId);
    for (const r of d.dependentRoles) allRoleIds.add(r);
  }
  for (const kd of knowledgeDomains) {
    for (const r of kd.heldByRoles) allRoleIds.add(r);
  }

  const maxDepCount = Math.max(1, ...dependencies.map(d => d.dependentRoles.length));

  const profiles: RoleRiskProfile[] = [];

  for (const roleId of allRoleIds) {
    // Bus Factor: 该角色掌握的关键知识还有多少人掌握
    const heldDomains = knowledgeDomains.filter(kd => kd.heldByRoles.includes(roleId));
    const busFactors = heldDomains.map(kd => kd.heldByRoles.length);
    const busFactor = heldDomains.length > 0
      ? busFactors.reduce((a, b) => a + b, 0) / busFactors.length
      : 0;

    // 依赖计数
    const depEntry = dependencies.find(d => d.dependedRoleId === roleId);
    const dependencyCount = depEntry ? depEntry.dependentRoles.length : 0;

    // 角色稀缺度
    const roleScarcity = roleScarcityMap[roleId] ?? 0.5;

    // 知识关键度均值
    const knowledgeCriticalityAvg = heldDomains.length > 0
      ? heldDomains.reduce((s, d) => s + d.criticality, 0) / heldDomains.length
      : 0;

    const overallRiskScore = computeOverallRiskScore({
      busFactor: Math.round(busFactor),
      roleScarcity,
      dependencyCount,
      knowledgeCriticalityAvg,
      maxDependencyCount: maxDepCount,
    });

    // 恢复时间估计 = 风险分 * 90 天
    const estimatedRecoveryDays = Math.round(overallRiskScore * 90);

    let riskLevel: RoleRiskProfile['riskLevel'];
    if (overallRiskScore >= 0.7) riskLevel = 'critical';
    else if (overallRiskScore >= 0.45) riskLevel = 'high';
    else if (overallRiskScore >= 0.25) riskLevel = 'medium';
    else riskLevel = 'low';

    profiles.push({
      roleId,
      roleName: roleNames[roleId] ?? roleId,
      busFactor: Math.round(busFactor),
      roleScarcity,
      dependencyCount,
      criticalKnowledgeDomains: heldDomains.map(d => d.name),
      overallRiskScore: Math.round(overallRiskScore * 100) / 100,
      estimatedRecoveryDays,
      riskLevel,
    });
  }

  // 排序：高风险在前
  profiles.sort((a, b) => b.overallRiskScore - a.overallRiskScore);

  // 平均 Bus Factor
  const totalBusFactor = profiles.reduce((s, p) => s + p.busFactor, 0);
  const averageBusFactor = profiles.length > 0
    ? Math.round((totalBusFactor / profiles.length) * 10) / 10
    : 0;

  // 单点计数
  const singlePointCount = profiles.filter(p => p.busFactor <= 1).length;

  // 未覆盖的关键知识域
  const allCoveredDomains = new Set(profiles.flatMap(p => p.criticalKnowledgeDomains));
  const uncoveredDomains = knowledgeDomains
    .filter(kd => kd.criticality >= 0.7 && !allCoveredDomains.has(kd.name))
    .map(kd => kd.name);

  // SOG Risk 节点：为每个 high/critical 风险角色生成 Risk 节点，链接到对应 Person 节点
  const sogRiskNodes: SOGRiskNode[] = profiles
    .filter(p => p.riskLevel === 'critical' || p.riskLevel === 'high')
    .map(p => ({
      personId: p.roleId,
      nodeType: SOGNodeType.RISK,
      linkedNodeType: SOGNodeType.PERSON,
      riskType: `key_person_risk/${p.riskLevel}`,
      severity: p.riskLevel as 'high' | 'critical',
      status: 'active' as const,
      metadata: {
        roleName: p.roleName,
        busFactor: p.busFactor,
        overallRiskScore: p.overallRiskScore,
        estimatedRecoveryDays: p.estimatedRecoveryDays,
        criticalKnowledgeDomains: p.criticalKnowledgeDomains,
      },
    }));

  return {
    teamId,
    profiles,
    topSpofRisks: profiles.filter(p => p.riskLevel === 'critical').slice(0, 3),
    averageBusFactor,
    singlePointCount,
    uncoveredDomains,
    generatedAt: new Date().toISOString(),
    sogRiskNodes,
  };
}

// ====================================================================
// 便捷构造器
// ====================================================================

/** 从简易角色列表构造依赖关系（假设所有角色互相依赖） */
export function buildDependenciesFromRoles(
  roleIds: string[],
  dependencyType: RoleDependency['dependencyType'] = 'knowledge',
): RoleDependency[] {
  if (roleIds.length <= 1) return [];
  return roleIds.map((roleId, i) => ({
    dependedRoleId: roleId,
    dependentRoles: roleIds.filter((_, j) => j !== i),
    dependencyType,
    hasAlternative: roleIds.length > 2,
  }));
}

/** 从简易角色-知识映射构造知识域 */
export function buildKnowledgeDomains(
  roleKnowledgeMap: Record<string, string[]>,
  domainCriticality: Record<string, number> = {},
): KnowledgeDomain[] {
  const allDomains = new Set(Object.values(roleKnowledgeMap).flat());
  return [...allDomains].map(name => ({
    name,
    heldByRoles: Object.entries(roleKnowledgeMap)
      .filter(([, domains]) => domains.includes(name))
      .map(([roleId]) => roleId),
    criticality: domainCriticality[name] ?? 0.5,
  }));
}
