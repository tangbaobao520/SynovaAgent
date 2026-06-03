/**
 * validator.ts — 群像蒸馏校验审核器
 *
 * 用途：验证群像蒸馏产出的质量，检测角色可信度、协议配置可追溯性、
 *       7条红线违规、以及模板的整体合规性。
 *
 * 参考类型：
 *   - src/types.ts:          GapDimension, TeamProtocol, etc.
 *   - Schema v4.0 接口契约：   TeamTemplateSkeleton, ProbeReport, etc.
 *
 * 审核标准：docs/group-distill/VALIDATION-STANDARDS.md
 *
 * @package Synova
 */

// ============================================================
// 类型定义
// ============================================================

/** 群像蒸馏产出的团队模板骨架 */
export interface TeamTemplateSkeleton {
  /** 模板唯一标识 */
  templateId: string;

  /** 角色列表（群像蒸馏产出的心智模型集合） */
  roles: RoleDefinition[];

  /** 协议配置（6缝隙或6缝隙） */
  protocol?: ProtocolConfig;

  /** 角色间两两对比冲突矩阵（用于自洽性检查） */
  conflictMatrix?: ConflictEntry[];

  /** 诚实边界声明 */
  honestBoundaries: string[];

  /** 反模式列表 */
  antiPatterns: AntiPattern[];

  /** 推导方法说明 */
  derivationNotes: string[];
}

/** 探针报告——蒸馏的信源证据集合 */
export interface ProbeReport {
  /** 本次蒸馏的探针标识 */
  probeId: string;

  /** 扫描的行业/领域 */
  domain: string;

  /** 扫描的平台列表 */
  platforms: string[];

  /** 采集的信源条目 */
  sources: Source[];

  /** 扫描时间 */
  scanTime: string;

  /** 采集的数据类型 */
  dataTypes: ProbeDataType[];
}

type ProbeDataType =
  | 'job_description'
  | 'industry_report'
  | 'community_post'
  | 'interview_record'
  | 'textbook_excerpt'
  | 'platform_rule'
  | 'case_study'
  | 'other';

/** 单条信源 */
export interface Source {
  /** 信源唯一标识 */
  id: string;

  /** 信源类型 */
  type: ProbeDataType;

  /** 信源名称/标题 */
  title: string;

  /** 信源URL或出处 */
  url?: string;

  /** 平台/来源平台 */
  platform?: string;

  /** 信源可信度分级（VALIDATION-STANDARDS.md 中的 L1-L5） */
  tier: 1 | 2 | 3 | 4 | 5;

  /** 信源摘要 */
  summary: string;

  /** 该信源支撑的心智模型ID列表 */
  supportsModelIds: string[];

  /** 该信源支撑的协议缝隙 */
  supportsGaps?: string[];
}

/** 角色定义 */
export interface RoleDefinition {
  /** 角色唯一标识 */
  id: string;

  /** 角色名称 */
  name: string;

  /** 推导可信度（VALIDATION-STANDARDS.md 中的 L1-L5） */
  credibilityLevel: 1 | 2 | 3 | 4 | 5;

  /** 心智模型列表 */
  mentalModels: MentalModel[];

  /** 推导说明 */
  derivationNotes: string[];

  /** 诚实边界（针对该角色） */
  honestBoundaries: string[];
}

/** 心智模型 */
export interface MentalModel {
  /** 模型ID */
  id: string;

  /** 模型名称 */
  name: string;

  /** 一句话描述 */
  oneLiner: string;

  /** 来源框架 */
  source: string;

  /** 应用场景 */
  application: string;

  /** 局限性 */
  limitation: string;

  /** 适用决策场景 */
  decisionScenarios: string[];

  /** 反模式列表 */
  antiPatternIds: string[];

  /** 支撑信源ID列表 */
  sourceIds: string[];
}

/** 协议配置 */
export interface ProtocolConfig {
  /** 协同模式 */
  mode: CollaborationMode;

  /** 6缝隙配置 */
  gaps: {
    divisionOfLabor: GapConfig;
    informationFlow: GapConfig;
    authorityGovernance: GapConfig;
    trustIncentive: GapConfig;
  };

  /** 每条规则的来源 */
  ruleSources: RuleSource[];
}

interface GapConfig {
  value: string;
  confidence: 'high' | 'medium' | 'low' | 'default';
  sourceIds: string[];
  note?: string;
}

type CollaborationMode =
  | 'iron_captain'
  | 'democratic_assembly'
  | 'loose_federation'
  | 'cross_checks';

interface RuleSource {
  ruleId: string;
  sourceType: 'constraint' | 'celebrity_mode' | 'group_image' | 'user_override';
  sourceDetail: string;
}

/** 冲突记录（两两对比用） */
export interface ConflictEntry {
  modelAId: string;
  modelBId: string;
  conflictType: 'fatal' | 'severe' | 'mild' | 'complementary';
  description: string;
  severity: number; // 0-5, 0=无冲突, 5=致命
  resolution?: string;
}

/** 反模式 */
export interface AntiPattern {
  id: string;
  pattern: string;
  description: string;
  boundModelIds: string[];
}

// ============================================================
// 审核结果类型
// ============================================================

/** 审核报告 */
export interface ValidationReport {
  /** 模板ID */
  templateId: string;

  /** 总体结果 */
  overall: 'passed' | 'conditional_pass' | 'failed';

  /** 各维度评分 */
  scores: {
    rationality: number;          // 合理性 0-20
    selfConsistency: SelfConsistencyResult;
    operability: number;           // 可操作性 0-5 (平均)
    sourceStrength: number;        // 信源强度 1-5 (平均)
  };

  /** 7条红线检查结果 */
  redlineResults: RedlineResult[];

  /** 协议可追溯性报告（如有协议配置） */
  traceability?: TraceabilityReport;

  /** 角色可信度明细 */
  roleCredibilityScores: CredibilityScore[];

  /** 红线违规列表 */
  redlineViolations: string[];

  /** 警告列表 */
  warnings: string[];

  /** 建议 */
  recommendations: string[];

  /** 审核时间 */
  validatedAt: string;
}

/** 自洽性检查结果 */
export interface SelfConsistencyResult {
  status: 'passed' | 'conditional' | 'failed';
  fatalConflicts: number;
  severeConflicts: number;
  mildConflicts: number;
  complementaryPairs: number;
  conflictDetails: ConflictEntry[];
  recommendation?: string;
}

/** 红线检查结果 */
export interface RedlineResult {
  ruleId: number;
  name: string;
  passed: boolean;
  severity: 'error' | 'warning' | 'info';
  detail: string;
}

/** 角色可信度评分 */
export interface CredibilityScore {
  roleId: string;
  roleName: string;
  /** L1-L5 可信度等级 */
  credibilityLevel: 1 | 2 | 3 | 4 | 5;
  /** 支撑信源数量 */
  sourceCount: number;
  /** 是否有诚实边界 */
  hasHonestBoundaries: boolean;
  /** 心智模型完整性（所有必要字段是否齐全） */
  modelCompleteness: boolean;
  /** 反模式绑定率 */
  antiPatternBindingRate: number;
  /** 总体评分 0-100 */
  totalScore: number;
  warnings: string[];
}

/** 协议可追溯性报告 */
export interface TraceabilityReport {
  /** 探针标识 */
  probeId: string;
  /** 每个缝隙的可追溯状态 */
  gapTraceability: GapTraceabilityEntry[];
  /** 无信源支撑的规则数 */
  unsourcedRules: number;
  /** 总规则数 */
  totalRules: number;
  /** 整体可追溯率 */
  traceabilityRate: number;
  /** 警告 */
  warnings: string[];
}

interface GapTraceabilityEntry {
  gapName: string;
  confidence: 'high' | 'medium' | 'low' | 'default';
  sourceCount: number;
  sources: string[];
  traceable: boolean;
}

// ============================================================
// 审核核心逻辑
// ============================================================

// ---- 红线定义 ----

const REDLINES = [
  {
    id: 1,
    name: '不依赖单一平台推导团队架构',
    check: (template: TeamTemplateSkeleton, report: ProbeReport): RedlineResult => {
      const platformsUsed = new Set<string>();
      for (const role of template.roles) {
        for (const model of role.mentalModels) {
          for (const srcId of model.sourceIds) {
            const source = report.sources.find(s => s.id === srcId);
            if (source?.platform) platformsUsed.add(source.platform);
          }
        }
      }
      const passed = platformsUsed.size >= 2 || report.platforms.length >= 2;
      return {
        ruleId: 1,
        name: '不依赖单一平台推导团队架构',
        passed,
        severity: passed ? 'info' : 'error',
        detail: passed
          ? `覆盖 ${platformsUsed.size} 个平台：${[...platformsUsed].join('、')}`
          : `仅覆盖 ${platformsUsed.size} 个平台，需要至少 2 个独立平台的信源交叉验证`,
      };
    },
  },
  {
    id: 2,
    name: '约束→决策→框架三步骤完整',
    check: (template: TeamTemplateSkeleton, _report: ProbeReport): RedlineResult => {
      const incomplete: string[] = [];
      for (const role of template.roles) {
        for (const model of role.mentalModels) {
          const hasApp = model.application.length > 0;
          const hasLimit = model.limitation.length > 0;
          const hasOneLiner = model.oneLiner.length > 0;
          const hasScenarios = model.decisionScenarios.length > 0;
          if (!hasApp || !hasLimit || !hasOneLiner || !hasScenarios) {
            incomplete.push(`${role.name} / ${model.name}`);
          }
        }
      }
      const passed = incomplete.length === 0;
      return {
        ruleId: 2,
        name: '约束→决策→框架三步骤完整',
        passed,
        severity: passed ? 'info' : 'error',
        detail: passed
          ? '所有模型均包含 application / limitation / oneLiner / decisionScenarios'
          : `以下模型不完整：${incomplete.join('；')}`,
      };
    },
  },
  {
    id: 3,
    name: '跨角色交叉验证',
    check: (template: TeamTemplateSkeleton, _report: ProbeReport): RedlineResult => {
      const passed = !!template.conflictMatrix && template.conflictMatrix.length > 0;
      return {
        ruleId: 3,
        name: '跨角色交叉验证',
        passed,
        severity: passed ? 'info' : 'error',
        detail: passed
          ? `已执行 ${template.conflictMatrix!.length} 对模型交叉验证`
          : '未提供 conflictMatrix，需要执行角色间两两对比',
      };
    },
  },
  {
    id: 4,
    name: '诚实边界法则',
    check: (template: TeamTemplateSkeleton, _report: ProbeReport): RedlineResult => {
      const hasTemplateBoundaries = template.honestBoundaries.length > 0;
      const allRolesHaveBoundaries = template.roles.every(r => r.honestBoundaries.length > 0);
      const passed = hasTemplateBoundaries && allRolesHaveBoundaries;
      const missingRoles = template.roles
        .filter(r => r.honestBoundaries.length === 0)
        .map(r => r.name);
      return {
        ruleId: 4,
        name: '诚实边界法则',
        passed,
        severity: passed ? 'info' : 'error',
        detail: passed
          ? '模板级 + 所有角色均已附带诚实边界声明'
          : `以下角色缺少诚实边界：${missingRoles.join('、')}${missingRoles.length > 0 ? '；' : ''}${!hasTemplateBoundaries ? '模板级诚实边界缺失' : ''}`,
      };
    },
  },
  {
    id: 5,
    name: '不可只做"贴标签"蒸馏',
    check: (template: TeamTemplateSkeleton, _report: ProbeReport): RedlineResult => {
      const incompleteModels: string[] = [];
      for (const role of template.roles) {
        for (const model of role.mentalModels) {
          const hasOneLiner = model.oneLiner.trim().length > 0;
          const hasApp = model.application.trim().length > 0;
          const hasLimit = model.limitation.trim().length > 0;
          const hasAntiPatterns = model.antiPatternIds.length > 0;
          if (!hasOneLiner || !hasApp || !hasLimit || !hasAntiPatterns) {
            incompleteModels.push(`${role.name} / ${model.name}`);
          }
        }
      }
      const passed = incompleteModels.length === 0;
      return {
        ruleId: 5,
        name: '不可只做"贴标签"蒸馏',
        passed,
        severity: passed ? 'info' : 'error',
        detail: passed
          ? '所有模型包含完整字段（oneLiner / application / limitation / antiPatterns）'
          : `以下模型缺少必要字段：${incompleteModels.join('；')}`,
      };
    },
  },
  {
    id: 6,
    name: '反模式必须与心智模型对应',
    check: (template: TeamTemplateSkeleton, _report: ProbeReport): RedlineResult => {
      const allModelAntiPatternIds = new Set<string>();
      for (const role of template.roles) {
        for (const model of role.mentalModels) {
          for (const apId of model.antiPatternIds) {
            allModelAntiPatternIds.add(apId);
          }
        }
      }

      const unusedAntiPatterns: string[] = [];
      for (const ap of template.antiPatterns) {
        if (!allModelAntiPatternIds.has(ap.id)) {
          unusedAntiPatterns.push(ap.pattern);
        }
      }

      const passed = unusedAntiPatterns.length === 0;
      return {
        ruleId: 6,
        name: '反模式必须与心智模型对应',
        passed,
        severity: passed ? 'info' : 'warning',
        detail: passed
          ? '所有反模式均已绑定到至少一个心智模型'
          : `以下反模式未绑定任何心智模型：${unusedAntiPatterns.join('、')}`,
      };
    },
  },
  {
    id: 7,
    name: '群像蒸馏的信源强度总和必须 ≥ 2.5',
    check: (template: TeamTemplateSkeleton, report: ProbeReport): RedlineResult => {
      const sourceTiers = report.sources.map(s => s.tier);
      const avgSourceStrength =
        sourceTiers.reduce((a, b) => a + b, 0) / sourceTiers.length;
      const passed = avgSourceStrength >= 2.5;
      return {
        ruleId: 7,
        name: '群像蒸馏的信源强度总和必须 ≥ 2.5',
        passed,
        severity: passed ? 'info' : 'error',
        detail: passed
          ? `平均信源强度 ${avgSourceStrength.toFixed(2)}/5 ≥ 2.5 ✓`
          : `平均信源强度 ${avgSourceStrength.toFixed(2)}/5 < 2.5，建议补充行业信源`,
      };
    },
  },
];

// ============================================================
// 导出函数
// ============================================================

/**
 * 审核群像蒸馏产出的整体质量
 *
 * @param template - 群像蒸馏产出的团队模板
 * @param probeReport - 探针报告（信源证据集合）
 * @returns ValidationReport - 完整的审核报告
 */
export function validateGroupDistill(
  template: TeamTemplateSkeleton,
  probeReport: ProbeReport
): ValidationReport {
  const warnings: string[] = [];
  const recommendations: string[] = [];

  // 1. 合理性评分
  const rationality = scoreRationality(template);

  // 2. 自洽性检查
  const selfConsistency = checkSelfConsistency(template);

  // 3. 可操作性评分
  const operability = scoreOperability(template);

  // 4. 信源强度
  const sourceStrength = scoreSourceStrength(probeReport);

  // 5. 红线检查
  const redlineResults = REDLINES.map(rl => rl.check(template, probeReport));
  const redlineViolations = redlineResults
    .filter(r => !r.passed && r.severity === 'error')
    .map(r => `红线${r.ruleId}：${r.detail}`);

  // 6. 角色可信度明细
  const roleCredibilityScores = template.roles.map(role =>
    checkRoleCredibility(role, probeReport.sources)
  );

  // 7. 协议可追溯性（如有）
  let traceability: TraceabilityReport | undefined;
  if (template.protocol) {
    traceability = checkProtocolTraceability(template.protocol, probeReport);
  }

  // 8. 综合判定
  const rationalityPassed = rationality >= 12;
  const selfConsistencyPassed = selfConsistency.status !== 'failed';
  const operabilityPassed = operability >= 3.5;
  const sourcePassed = sourceStrength >= 2.5;
  const redlinesPassed = redlineViolations.length === 0;

  // 边缘情况：有条件通过
  const fatalRedlines = redlineViolations.length;
  const fudgeFactor =
    rationalityPassed && selfConsistencyPassed && sourcePassed ? 1 : 0;

  let overall: 'passed' | 'conditional_pass' | 'failed';
  if (rationalityPassed && selfConsistencyPassed && sourcePassed && operabilityPassed && redlinesPassed) {
    overall = 'passed';
  } else if (
    rationalityPassed &&
    selfConsistencyPassed &&
    sourcePassed &&
    (operabilityPassed || fatalRedlines <= 1)
  ) {
    overall = 'conditional_pass';
    if (!operabilityPassed) {
      warnings.push('可操作性评分偏低（平均 < 3.5/5），建议补充行为指引和边界条件');
    }
    if (fatalRedlines > 0) {
      warnings.push(`触发 ${fatalRedlines} 条红线，建议修正后重新审核`);
    }
  } else {
    overall = 'failed';
  }

  // 建议
  if (template.protocol && !traceability) {
    recommendations.push('协议配置信息不足，建议补充探针报告中与协议相关的信源');
  }
  const missingCoverage = findMissingCoverage(template);
  if (missingCoverage.length > 0) {
    recommendations.push(`以下决策场景未被心智模型覆盖：${missingCoverage.join('、')}`);
  }

  return {
    templateId: template.templateId,
    overall,
    scores: {
      rationality,
      selfConsistency,
      operability,
      sourceStrength,
    },
    redlineResults,
    traceability,
    roleCredibilityScores,
    redlineViolations,
    warnings,
    recommendations,
    validatedAt: new Date().toISOString(),
  };
}

/**
 * 检查单条角色的可信度
 *
 * @param role - 角色定义
 * @param sources - 探针信源集合
 * @returns CredibilityScore - 角色可信度评分
 */
export function checkRoleCredibility(
  role: RoleDefinition,
  sources: Source[]
): CredibilityScore {
  const warnings: string[] = [];

  // 计算支撑信源
  const allSourceIds = new Set<string>();
  for (const model of role.mentalModels) {
    for (const sid of model.sourceIds) {
      allSourceIds.add(sid);
    }
  }
  const roleSources = sources.filter(s => allSourceIds.has(s.id));
  const sourceCount = roleSources.length;

  // 检查心智模型完整性
  let modelCompleteness = true;
  let totalFields = 0;
  let filledFields = 0;
  for (const model of role.mentalModels) {
    const hasOneLiner = model.oneLiner.trim().length > 0;
    const hasApp = model.application.trim().length > 0;
    const hasLimit = model.limitation.trim().length > 0;
    const hasScenarios = model.decisionScenarios.length > 0;
    const hasAntiPatterns = model.antiPatternIds.length > 0;
    totalFields += 5;
    if (hasOneLiner) filledFields++;
    if (hasApp) filledFields++;
    if (hasLimit) filledFields++;
    if (hasScenarios) filledFields++;
    if (hasAntiPatterns) filledFields++;
  }
  const completenessRate =
    totalFields > 0 ? filledFields / totalFields : 0;
  modelCompleteness = completenessRate >= 0.8;

  if (!modelCompleteness) {
    warnings.push(`心智模型字段填写率 ${(completenessRate * 100).toFixed(0)}%，低于80%`);
  }

  // 反模式绑定率
  let totalAntiPatterns = 0;
  let boundAntiPatterns = 0;
  for (const model of role.mentalModels) {
    totalAntiPatterns += model.antiPatternIds.length;
    boundAntiPatterns += model.antiPatternIds.length; // 有ID即有绑定
  }
  const antiPatternBindingRate =
    totalAntiPatterns > 0 ? boundAntiPatterns / totalAntiPatterns : totalAntiPatterns > 0
      ? 1
      : 0;

  if (totalAntiPatterns === 0) {
    warnings.push('该角色没有定义任何反模式');
  }

  // 诚实边界检查
  const hasHonestBoundaries = role.honestBoundaries.length > 0;
  if (!hasHonestBoundaries) {
    warnings.push('缺少诚实边界声明');
  }

  // 信源质量评分
  const tierScore =
    roleSources.length > 0
      ? roleSources.reduce((sum, s) => sum + s.tier, 0) / roleSources.length
      : 0;

  // 综合评分 0-100
  const tierWeight = 0.4;
  const completenessWeight = 0.2;
  const boundaryWeight = 0.15;
  const antiPatternWeight = 0.15;
  const sourceCountWeight = 0.1;

  const tierScoreNormalized = ((tierScore - 1) / 4) * 100;
  const completenessScore = completenessRate * 100;
  const boundaryScore = hasHonestBoundaries ? 100 : 0;
  const sourceCountScore = Math.min(sourceCount / 5, 1) * 100;

  const totalScore =
    tierScoreNormalized * tierWeight +
    completenessScore * completenessWeight +
    boundaryScore * boundaryWeight +
    antiPatternBindingRate * 100 * antiPatternWeight +
    sourceCountScore * sourceCountWeight;

  return {
    roleId: role.id,
    roleName: role.name,
    credibilityLevel: role.credibilityLevel,
    sourceCount,
    hasHonestBoundaries,
    modelCompleteness,
    antiPatternBindingRate,
    totalScore: Math.round(totalScore),
    warnings,
  };
}

/**
 * 检查协议配置是否来自探针证据的可追溯性
 *
 * @param protocol - 协议配置
 * @param probeReport - 探针报告
 * @returns TraceabilityReport - 可追溯性报告
 */
export function checkProtocolTraceability(
  protocol: ProtocolConfig,
  probeReport: ProbeReport
): TraceabilityReport {
  const gapNames = [
    'divisionOfLabor',
    'informationFlow',
    'conflictResolution',
    'powerDistribution',
    'incentiveAlignment',
    'trustModel',
  ] as const;

  const gapTraceability: GapTraceabilityEntry[] = [];
  const warnings: string[] = [];
  let totalRules = 0;
  let sourcedRules = 0;

  for (const gapName of gapNames) {
    const gap = protocol.gaps[gapName as keyof typeof protocol.gaps];
    const sourceIds = gap?.sourceIds ?? [];

    // 追溯：检查 sourceIds 中有多少能在 probeReport 中找到
    const matchedSources = sourceIds.filter(sid =>
      probeReport.sources.some(s => s.id === sid)
    );

    totalRules++;
    if (matchedSources.length > 0 || gap.confidence === 'default') {
      sourcedRules++;
    }

    gapTraceability.push({
      gapName: gapName as string,
      confidence: gap?.confidence ?? 'default',
      sourceCount: matchedSources.length,
      sources: matchedSources,
      traceable: matchedSources.length > 0 || gap.confidence === 'default',
    });

    if (gap.confidence === 'high' && matchedSources.length === 0) {
      warnings.push(`${gapName}: 置信度为 high 但无支撑信源`);
    }
  }

  // 检查 ruleSources
  for (const rs of protocol.ruleSources) {
    totalRules++;
    if (rs.sourceType !== 'user_override') {
      sourcedRules++;
    }
  }

  const traceabilityRate = totalRules > 0 ? sourcedRules / totalRules : 0;

  const unsourcedRules = totalRules - sourcedRules;

  if (unsourcedRules > 0) {
    warnings.push(`${unsourcedRules}/${totalRules} 条规则无信源支撑`);
  }

  return {
    probeId: probeReport.probeId,
    gapTraceability,
    unsourcedRules,
    totalRules,
    traceabilityRate,
    warnings,
  };
}

// ============================================================
// 内部辅助函数
// ============================================================

/**
 * 合理性评分（0-20）
 * 检查心智模型是否覆盖角色的核心工作场景
 */
function scoreRationality(template: TeamTemplateSkeleton): number {
  let totalScore = 0;
  let modelCount = 0;

  for (const role of template.roles) {
    for (const _model of role.mentalModels) {
      modelCount++;
      // 场景覆盖率代理指标：decisionScenarios 数量
      const scenarioCount = Math.min(_model.decisionScenarios.length, 5);
      const hasApplication = _model.application.length > 0 ? 1 : 0;
      const hasSource = _model.sourceIds.length > 0 ? 1 : 0;

      // 每模型评分 1-5
      const score = Math.min(
        1 + scenarioCount * 0.6 + hasApplication * 0.5 + hasSource * 0.5,
        5
      );
      totalScore += score;
    }
  }

  // 每个角色期望 4 个模型
  const expectedModels = template.roles.length * 4;
  const modelRatio = Math.min(modelCount / expectedModels, 1);
  const coverageBonus = modelRatio * 2; // 最多 +2 分

  return Math.round((totalScore + coverageBonus) * 100) / 100;
}

/**
 * 自洽性检查
 * 检查心智模型之间是否存在冲突
 */
function checkSelfConsistency(
  template: TeamTemplateSkeleton
): SelfConsistencyResult {
  const conflicts = template.conflictMatrix ?? [];

  const fatalConflicts = conflicts.filter(c => c.conflictType === 'fatal').length;
  const severeConflicts = conflicts.filter(c => c.conflictType === 'severe').length;
  const mildConflicts = conflicts.filter(c => c.conflictType === 'mild').length;
  const complementaryPairs = conflicts.filter(
    c => c.conflictType === 'complementary'
  ).length;

  let status: 'passed' | 'conditional' | 'failed';
  let recommendation: string | undefined;

  if (fatalConflicts === 0 && severeConflicts <= 1) {
    status = 'passed';
  } else if (fatalConflicts === 0 && severeConflicts <= 3) {
    status = 'conditional';
    recommendation = `存在 ${severeConflicts} 个严重冲突，建议补充冲突消解层`;
  } else {
    status = 'failed';
    recommendation = fatalConflicts > 0
      ? `存在 ${fatalConflicts} 个致命冲突，需要重新设计`
      : `存在 ${severeConflicts} 个严重冲突（超过3个），需要重新设计`;
  }

  return {
    status,
    fatalConflicts,
    severeConflicts,
    mildConflicts,
    complementaryPairs,
    conflictDetails: conflicts,
    recommendation,
  };
}

/**
 * 可操作性评分（0-5 平均分）
 * 检查心智模型是否能转化为可执行的 Agent 行为
 */
function scoreOperability(template: TeamTemplateSkeleton): number {
  const modelScores: number[] = [];

  for (const role of template.roles) {
    for (const model of role.mentalModels) {
      // 行为指引：oneLiner + application 描述清晰度
      const guidance = Math.min(
        (model.oneLiner.length > 0 ? 1 : 0) +
          (model.application.length > 10 ? 1 : 0) +
          (model.decisionScenarios.length >= 2 ? 1 : 0),
        3
      );

      // 边界条件：limitation 描述
      const boundary = model.limitation.length > 20 ? 2 : model.limitation.length > 0 ? 1 : 0;

      // 决策树：decisionScenarios 覆盖
      const decisionTree = Math.min(model.decisionScenarios.length / 3, 2);

      // 反模式：有反模式指引
      const antiPatternScore = model.antiPatternIds.length > 0 ? 1.5 : 0;

      // 退出条件：是否有源头文件
      const exitCondition = model.source.length > 0 ? 0.5 : 0;

      const total = Math.min(
        (guidance * 0.3 + boundary * 0.25 + decisionTree * 0.2 + antiPatternScore * 0.15 + exitCondition * 0.1) * 5,
        5
      );

      modelScores.push(Math.round(total * 10) / 10);
    }
  }

  return modelScores.length > 0
    ? Math.round(
        (modelScores.reduce((a, b) => a + b, 0) / modelScores.length) * 100
      ) / 100
    : 0;
}

/**
 * 信源强度评分（基于VALIDATION-STANDARDS.md中的分级）
 */
function scoreSourceStrength(probeReport: ProbeReport): number {
  if (probeReport.sources.length === 0) return 0;

  const avgTier =
    probeReport.sources.reduce((sum, s) => sum + s.tier, 0) /
    probeReport.sources.length;

  return Math.round(avgTier * 100) / 100;
}

/**
 * 查找未被心智模型覆盖的缺失场景
 */
function findMissingCoverage(template: TeamTemplateSkeleton): string[] {
  // 这是一个启发式检查：看心智模型的 decisionScenarios 是否覆盖了常见供应链决策类型
  const knownDecisionTypes = [
    '供应商信任验证',
    '质量决策',
    '关系权衡',
    '优先级排序',
    '合规检查',
    '成本核算',
    '物流协调',
  ];

  const coveredScenarios = new Set<string>();
  for (const role of template.roles) {
    for (const model of role.mentalModels) {
      for (const scenario of model.decisionScenarios) {
        coveredScenarios.add(scenario);
      }
    }
  }

  // 简易匹配：检查已知决策类型是否在 coveredScenarios 中有近似匹配
  return knownDecisionTypes.filter(knownType => {
    return ![...coveredScenarios].some(covered =>
      covered.includes(knownType) || knownType.includes(covered)
    );
  });
}
