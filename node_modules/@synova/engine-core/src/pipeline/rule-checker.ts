/**
 * engine-server/pipeline/rule-checker.ts — 规则校验引擎
 *
 * 实现 AR-06 方案的三层仲裁中的第 3 层（规则校验兜底）。
 * 对 LLM 输出的 blueprint 执行 5 道结构化校验门。
 *
 * P0 实现：Gate #1 (合法角色数) + Gate #2 (权重校验)
 * P1.0 实现：Gate #3 (协议合法性) + Gate #4 (场景一致性)
 * P1.x 实现：Gate #5 (信源校验 - 需对接 M2 探针管道)
 *
 * @packageDocumentation
 */

import type { TeamStructureBlue, PersonaGenomeBlue } from '../types';
import { evaluateConfidence } from './phase-b/confidence-gate';

// ================================================================
// 类型定义
// ================================================================

export type GateName = 'role_count' | 'weight_range' | 'protocol_validity' | 'scene_consistency' | 'source_verification' | 'genome_quality' | 'confidence_independence';

export type GateSeverity = 'error' | 'warning' | 'info';

export interface GateResult {
  gate: GateName;
  passed: boolean;
  detail: string;
  severity?: GateSeverity;
}

export interface ValidationResult {
  passed: boolean;
  failedGates: string[];
  details: GateResult[];
  overallSeverity: 'pass' | 'warning' | 'error';
  corrected?: boolean;
  correctionLog?: string[];
}

// ================================================================
// 已知协作模式集合（来自 Schema v3.1）
// ================================================================

const KNOWN_COOPERATION_MODES = [
  'captain_mode',
  'parliament_mode',
  'outpost_mode',
  'swarm_mode',
  'cross_check_balance',
  'iron_captain',
  'democratic_council',
  'loose_federation',
  'bytedance_flat',
  'haier_ren_dan_he_yi',
  'haidilao_frontline_auth',
  'mckinsey_partnership',
  'tencent_internal_race',
] as const;

const KNOWN_GOVERNANCE_LAYERS = [
  'L1_understanding',
  'L2_execution',
  'L3_governance',
] as const;

// ================================================================
// Gate #1: 合法角色数
// ================================================================

function validateRoleCount(teamStructure: TeamStructureBlue): GateResult {
  const errors: string[] = [];

  // 1.1 角色数量必须 >= 1（不设上限——由 JTBD 任务复杂度决定，不预判）
  const count = teamStructure.totalRoles;
  if (typeof count !== 'number' || count < 1) {
    errors.push(`角色数 ${count} 无效，最小为 1`);
  }

  // 1.2 roles 数组与 totalRoles 一致
  if (!Array.isArray(teamStructure.roles)) {
    errors.push('roles 字段缺失或不是数组');
  } else {
    // 1.3 role.id 唯一
    const ids = teamStructure.roles.map(r => r.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (dupes.length > 0) {
      errors.push(`角色 id 重复: [${[...new Set(dupes)].join(', ')}]`);
    }

    // 1.4 role.id 和 name 非空
    for (const role of teamStructure.roles) {
      if (!role.id || role.id.trim() === '') {
        errors.push(`存在 id 为空的角色`);
        break;
      }
      if (!role.name || role.name.trim() === '') {
        errors.push(`角色 "${role.id}" 的 name 为空`);
      }
    }
  }

  const passed = errors.length === 0;
  return {
    gate: 'role_count',
    passed,
    detail: passed ? '角色数量结构校验通过' : errors.join('；'),
    severity: passed ? undefined : 'error',
  };
}

// ================================================================
// Gate #2: 权重校验
// ================================================================

function validateWeightRange(personaGenomes: PersonaGenomeBlue[]): GateResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!Array.isArray(personaGenomes) || personaGenomes.length === 0) {
    // 如果 personaGenomes 为空，不做拦截——可能是 pipeline 还未执行到 L2
    return {
      gate: 'weight_range',
      passed: true,
      detail: '无 personas 待校验（跳过）',
      severity: 'info',
    };
  }

  for (const pg of personaGenomes) {
    const scores = pg.oceanScores;

    // 2.1 OCEAN 各维度在 [0, 1] 区间
    for (const [dim, val] of Object.entries(scores)) {
      if (typeof val !== 'number' || val < 0 || val > 1) {
        errors.push(`角色 "${pg.roleId}" 的 ${dim}=${val} 超出 [0, 1]`);
      }
    }

    // 2.2 confidence 在 [0, 1] 区间（如果存在）
    if (pg.confidence !== undefined) {
      if (typeof pg.confidence !== 'number' || pg.confidence < 0 || pg.confidence > 1) {
        errors.push(`角色 "${pg.roleId}" 的 confidence=${pg.confidence} 超出 [0, 1]`);
      }
    }

    // 2.3 mentalModels 至少 1 个（如果有此字段）
    if (pg.mentalModels !== undefined) {
      if (!Array.isArray(pg.mentalModels) || pg.mentalModels.length < 1) {
        warnings.push(`角色 "${pg.roleId}" 的 mentalModels 少于 1 个`);
      }
    }
  }

  const passed = errors.length === 0;
  const detailParts: string[] = [];
  if (errors.length > 0) detailParts.push(...errors);
  if (warnings.length > 0) detailParts.push(`(警告) ${warnings.join('；')}`);
  if (detailParts.length === 0) detailParts.push('OCEAN 权重校验通过');

  return {
    gate: 'weight_range',
    passed,
    detail: detailParts.join('；'),
    severity: passed ? (warnings.length > 0 ? 'warning' : undefined) : 'error',
  };
}

// ================================================================
// Gate #3: 协议合法性
// ================================================================

function validateProtocolValidity(
  teamStructure: TeamStructureBlue,
  collaborationMode?: { mode?: string },
): GateResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 3.1 cooperationMode 在已知集合中
  if (!collaborationMode?.mode) {
    return {
      gate: 'protocol_validity',
      passed: true,
      detail: '无 collaborationMode 待校验（跳过）',
      severity: 'info',
    };
  }

  if (!KNOWN_COOPERATION_MODES.includes(collaborationMode.mode as typeof KNOWN_COOPERATION_MODES[number])) {
    errors.push(`协作模式 "${collaborationMode.mode}" 不在已知集合 [${KNOWN_COOPERATION_MODES.join(', ')}] 中`);
  }

  // 3.2 governanceLayer 层级合法
  if (Array.isArray(teamStructure.roles)) {
    // 治理层 L3 不超过 1 人（3-5 人团队）
    const smallTeam = teamStructure.totalRoles <= 5;
    if (smallTeam) {
      const l3Count = teamStructure.roles.filter(r => r.governanceLayer === 'L3_governance').length;
      if (l3Count > 1) {
        warnings.push(`小团队(≤5人)治理层 L3 有 ${l3Count} 人，建议不超过 1 人`);
      }
    }

    // governanceLayer 值合法
    for (const role of teamStructure.roles) {
      if (!KNOWN_GOVERNANCE_LAYERS.includes(role.governanceLayer as typeof KNOWN_GOVERNANCE_LAYERS[number])) {
        errors.push(`角色 "${role.id}" 的 governanceLayer="${role.governanceLayer}" 不合法`);
      }
    }
  }

  const passed = errors.length === 0;
  const detailParts: string[] = [];
  if (errors.length > 0) detailParts.push(...errors);
  if (warnings.length > 0) detailParts.push(`(建议) ${warnings.join('；')}`);
  if (detailParts.length === 0) detailParts.push('协议合法性校验通过');

  return {
    gate: 'protocol_validity',
    passed,
    detail: detailParts.join('；'),
    severity: passed ? (warnings.length > 0 ? 'warning' : undefined) : 'error',
  };
}

// ================================================================
// Gate #4: 场景一致性
// ================================================================

function validateSceneConsistency(
  teamStructure: TeamStructureBlue,
  personaGenomes: PersonaGenomeBlue[],
): GateResult {
  const errors: string[] = [];

  if (!Array.isArray(teamStructure.roles)) {
    return {
      gate: 'scene_consistency',
      passed: true,
      detail: '无角色待校验（跳过）',
      severity: 'info',
    };
  }

  // 4.1 角色数与 teamSize 一致
  if (teamStructure.totalRoles !== teamStructure.roles.length) {
    errors.push(`totalRoles(${teamStructure.totalRoles}) 与 roles 数组长度(${teamStructure.roles.length}) 不一致`);
  }

  // 4.2 每个角色有对应的 responsibilities
  for (const role of teamStructure.roles) {
    if (!Array.isArray(role.responsibilities) || role.responsibilities.length === 0) {
      errors.push(`角色 "${role.id}" 的 responsibilities 为空`);
    }
  }

  // 4.3 skillsRequired 引用正确的角色（基本校验：skillsRequired 非空）
  for (const role of teamStructure.roles) {
    if (!Array.isArray(role.skillsRequired) || role.skillsRequired.length === 0) {
      errors.push(`角色 "${role.id}" 的 skillsRequired 为空`);
    }
  }

  // 4.4 personaGenomes 的 roleId 能在 teamStructure.roles 中找到
  if (Array.isArray(personaGenomes)) {
    const roleIds = new Set(teamStructure.roles.map(r => r.id));
    for (const pg of personaGenomes) {
      if (!roleIds.has(pg.roleId)) {
        errors.push(`personaGenome 引用了不存在的 roleId: "${pg.roleId}"`);
      }
    }
  }

  const passed = errors.length === 0;
  return {
    gate: 'scene_consistency',
    passed,
    detail: passed ? '场景一致性校验通过' : errors.join('；'),
    severity: passed ? undefined : 'error',
  };
}

// ================================================================
// Gate #5: 信源校验（STUB）
// ================================================================

function validateSourceVerification(personaGenomes: PersonaGenomeBlue[]): GateResult {
  if (!Array.isArray(personaGenomes) || personaGenomes.length === 0) {
    return {
      gate: 'source_verification',
      passed: true,
      detail: '无 personaGenomes 待校验（跳过）',
      severity: 'info',
    };
  }

  // 收集所有心智模型的 source 字段
  let totalModels = 0;
  let sourcedModels = 0;
  const unsourcedRoles: string[] = [];
  const weakSourceRoles: string[] = [];

  for (const pg of personaGenomes) {
    if (!Array.isArray(pg.mentalModels) || pg.mentalModels.length === 0) continue;

    let roleUnsourced = 0;
    let roleTotal = 0;
    for (const mm of pg.mentalModels) {
      roleTotal++;
      const source = mm.source?.trim();
      if (source && source.length >= 3) {
        // source 至少有意义的长度（不是单个字符或空）
        sourcedModels++;
      } else {
        roleUnsourced++;
      }
    }
    totalModels += roleTotal;

    if (roleTotal > 0) {
      const roleRatio = (roleTotal - roleUnsourced) / roleTotal;
      if (roleRatio === 0) {
        unsourcedRoles.push(pg.roleName || pg.roleId);
      } else if (roleRatio < 0.5) {
        weakSourceRoles.push(`${pg.roleName || pg.roleId} (${Math.round(roleRatio * 100)}%)`);
      }
    }
  }

  if (totalModels === 0) {
    return {
      gate: 'source_verification',
      passed: true,
      detail: '无心智模型待校验（跳过）',
      severity: 'info',
    };
  }

  const ratio = sourcedModels / totalModels;
  const detailParts: string[] = [`信源覆盖率: ${sourcedModels}/${totalModels} (${Math.round(ratio * 100)}%)`];

  if (unsourcedRoles.length > 0) {
    detailParts.push(`完全无信源的角色: ${unsourcedRoles.join('、')}`);
  }
  if (weakSourceRoles.length > 0) {
    detailParts.push(`信源不足的角色: ${weakSourceRoles.join('、')}`);
  }

  if (ratio < 0.3) {
    return {
      gate: 'source_verification',
      passed: false,
      detail: detailParts.join('；') + ' — 信源覆盖率过低，心智模型缺乏可追溯来源',
      severity: 'error',
    };
  }

  if (ratio < 0.6) {
    return {
      gate: 'source_verification',
      passed: true,
      detail: detailParts.join('；') + ' — 建议补充心智模型来源引用',
      severity: 'warning',
    };
  }

  return {
    gate: 'source_verification',
    passed: true,
    detail: detailParts.join('；'),
  };
}

// ================================================================
// ================================================================
// Gate #7: 置信度独立性（AR-08 Confidence-tier 元数据产出）
// ================================================================

function validateConfidenceIndependence(personaGenomes: PersonaGenomeBlue[]): GateResult {
  if (!Array.isArray(personaGenomes) || personaGenomes.length === 0) {
    return {
      gate: 'confidence_independence',
      passed: true,
      detail: '无 genome 待校验（跳过）',
      severity: 'info',
    };
  }

  const result = evaluateConfidence(personaGenomes);
  const issues: string[] = [];

  for (const entry of result.genomes) {
    const meta = entry.metadata;
    if (meta.isDegraded) {
      issues.push(meta.degradeReason!);
    }
  }

  // 如果全部通过（无降级），记录注入策略建议
  if (!result.anyDegraded) {
    // 统计各 tier 分布
    const tiers = result.genomes.map(g => ({
      roleName: g.metadata.roleName,
      tier: g.metadata.ruleCheckerConfidence >= 0.7 ? 'high' : (g.metadata.ruleCheckerConfidence >= 0.4 ? 'medium' : 'low'),
    }));
    const highCount = tiers.filter(t => t.tier === 'high').length;
    const mediumCount = tiers.filter(t => t.tier === 'medium').length;
    return {
      gate: 'confidence_independence',
      passed: true,
      detail: `置信度独立性校验通过 | 独立评估结果: high=${highCount}, medium=${mediumCount}, 无低分降级`,
      severity: 'info',
    };
  }

  const passed = false;
  return {
    gate: 'confidence_independence',
    passed,
    detail: issues.join('；'),
    severity: 'warning',
  };
}

// Gate #6: 基因组质量（从旧 validator.ts 的 7 条红线适配）
// ================================================================

function validateGenomeQuality(personaGenomes: PersonaGenomeBlue[]): GateResult {
  const issues: string[] = [];

  if (!Array.isArray(personaGenomes) || personaGenomes.length === 0) {
    return {
      gate: 'genome_quality',
      passed: true,
      detail: '无 genome 待校验（跳过）',
      severity: 'info',
    };
  }

  for (const pg of personaGenomes) {
    // 6.1 角色必须有诚实边界
    if (!Array.isArray(pg.honestBoundaries) || pg.honestBoundaries.length === 0) {
      issues.push(`角色 "${pg.roleName}" 缺少诚实边界`);
    }

    // 6.2 角色必须有反模式
    if (!Array.isArray(pg.antiPatterns) || pg.antiPatterns.length === 0) {
      issues.push(`角色 "${pg.roleName}" 缺少反模式`);
    }

    // 6.3 思维模型必须包含完整字段
    if (Array.isArray(pg.mentalModels)) {
      if (pg.mentalModels.length < 2) {
        issues.push(`角色 "${pg.roleName}" 只有 ${pg.mentalModels.length} 个思维模型（建议至少 2 个）`);
      }
      for (const mm of pg.mentalModels) {
        if (!mm.name || !mm.oneLiner) {
          issues.push(`角色 "${pg.roleName}" 的思维模型缺少 name 或 oneLiner`);
          break;
        }
        if (!mm.application || mm.application.length < 6) {
          issues.push(`角色 "${pg.roleName}" 的思维模型 "${mm.name}" 缺少场景特化的 application`);
        }
      }
    } else {
      issues.push(`角色 "${pg.roleName}" 缺少思维模型数组`);
    }

    // 6.4 OCEAN 必须反映角色认知特征——不设硬限制，但检测异常值
    const scores = pg.oceanScores;
    if (scores) {
      // 全0.5的默认值说明LLM没认真填
      const allDefault = Object.values(scores).every(v => v === 0.5);
      if (allDefault) {
        issues.push(`角色 "${pg.roleName}" 的 OCEAN 全为 0.5（可能是 LLM 未正确填充）`);
      }
    }
  }

  const passed = issues.length === 0;
  return {
    gate: 'genome_quality',
    passed,
    detail: passed ? '基因组质量校验通过' : issues.join('；'),
    severity: passed ? undefined : 'warning',
  };
}

/**
 * 角色可信度评分（适配 validator.ts 的 CredibilityScore 概念）
 * 输出到 correctionLog 供用户参考
 */
export function scoreRoleCredibility(personaGenomes: PersonaGenomeBlue[]): Array<{
  roleId: string;
  roleName: string;
  totalScore: number;
  warnings: string[];
}> {
  return personaGenomes.map(pg => {
    const warnings: string[] = [];

    // OCEAN 多样性分
    const oceanValues = Object.values(pg.oceanScores);
    const variance = oceanValues.reduce((sum, v) => sum + Math.abs(v - 0.5), 0) / oceanValues.length;
    const oceanScore = Math.min(variance * 100, 30); // 0-30

    // 思维模型完整性
    let modelScore = 0;
    if (Array.isArray(pg.mentalModels) && pg.mentalModels.length >= 2) {
      modelScore = Math.min(pg.mentalModels.length * 5, 25);

      // 检查 application 质量
      let appliedCount = 0;
      for (const mm of pg.mentalModels) {
        if (mm.application && mm.application.length > 6) appliedCount++;
        if (mm.decisionScenarios && mm.decisionScenarios.length > 0) appliedCount++;
      }
      modelScore += Math.min(appliedCount * 2, 10);
    } else {
      warnings.push(`思维模型不足 2 个`);
    }

    // 诚实边界
    const boundaryScore = Array.isArray(pg.honestBoundaries) && pg.honestBoundaries.length > 0
      ? Math.min(pg.honestBoundaries.length * 5, 15)
      : 0;
    if (boundaryScore === 0) warnings.push('缺少诚实边界声明');

    // 反模式
    const antiPatternScore = Array.isArray(pg.antiPatterns) && pg.antiPatterns.length > 0
      ? Math.min(pg.antiPatterns.length * 5, 15)
      : 0;
    if (antiPatternScore === 0) warnings.push('缺少反模式');

    // 置信度
    const confidenceScore = pg.confidence ? Math.round(pg.confidence * 10) : 0; // 0-10

    const totalScore = Math.min(oceanScore + modelScore + boundaryScore + antiPatternScore + confidenceScore, 100);

    return {
      roleId: pg.roleId,
      roleName: pg.roleName,
      totalScore,
      warnings,
    };
  });
}

// ================================================================
// 自动修正逻辑（轻微违规）
// ================================================================

function autoCorrect(
  teamStructure: TeamStructureBlue,
  gateResults: GateResult[],
): { corrected: boolean; log: string[] } {
  const log: string[] = [];
  let corrected = false;

  for (const result of gateResults) {
    if (result.passed || result.severity === 'error') continue;

    // 处理警告级别的自动修正
    if (result.gate === 'weight_range' && result.severity === 'warning') {
      // 警告级别不自动修正，仅记录
      log.push(`[info] weight_range 告警: ${result.detail}`);
    }
  }

  return { corrected, log: log.length > 0 ? log : ['无需修正'] };
}

// ================================================================
// 主校验入口
// ================================================================

/**
 * 对输出的 blueprint 执行规则校验
 *
 * @param teamStructure - L1 输出的团队结构
 * @param personaGenomes - L2 输出的角色认知基因（可选）
 * @param collaborationMode - L3 输出的协作模式（可选）
 * @param options - 配置选项
 * @returns 校验结果
 */
export function validateBlueprint(
  teamStructure: TeamStructureBlue,
  personaGenomes: PersonaGenomeBlue[],
  collaborationMode?: { mode?: string },
  options?: {
    /** 启用 Gate #3 校验 */
    checkProtocol?: boolean;
    /** 启用 Gate #4 校验 */
    checkConsistency?: boolean;
  },
): ValidationResult {
  const { checkProtocol = false, checkConsistency = false } = options || {};

  // 执行各 gate
  const gateResults: GateResult[] = [
    validateRoleCount(teamStructure),
    validateWeightRange(personaGenomes),
  ];

  if (checkProtocol) {
    gateResults.push(validateProtocolValidity(teamStructure, collaborationMode));
  }

  if (checkConsistency) {
    gateResults.push(validateSceneConsistency(teamStructure, personaGenomes));
  }

  // Gate #5: 信源校验
  gateResults.push(validateSourceVerification(personaGenomes));

  // Gate #6: 基因组质量（如果提供了 personaGenomes）
  if (personaGenomes && personaGenomes.length > 0) {
    gateResults.push(validateGenomeQuality(personaGenomes));
  }

  // Gate #7: 置信度独立性（AR-08 Confidence-tier — 独立元数据产出）
  if (personaGenomes && personaGenomes.length > 0) {
    gateResults.push(validateConfidenceIndependence(personaGenomes));
  }

  // 角色可信度评分
  const credibilityScores: Array<{ roleId: string; roleName: string; totalScore: number; warnings: string[] }> = [];
  const credLog: string[] = [];
  if (personaGenomes && personaGenomes.length > 0) {
    const scores = scoreRoleCredibility(personaGenomes);
    credibilityScores.push(...scores);
    const lowScoreRoles = scores.filter(s => s.totalScore < 60);
    if (lowScoreRoles.length > 0) {
      credLog.push(`可信度警告: ${lowScoreRoles.map(r => `${r.roleName}(${r.totalScore}分)`).join(', ')}`);
    }
  }

  // 聚合结果
  const failedGates = gateResults
    .filter(g => !g.passed)
    .map(g => g.gate);

  const hasErrors = gateResults.some(g => g.severity === 'error');
  const hasWarnings = gateResults.some(g => g.severity === 'warning');
  const passed = failedGates.length === 0;

  // 自动修正
  const { corrected, log } = autoCorrect(teamStructure, gateResults);

  return {
    passed,
    failedGates,
    details: gateResults,
    overallSeverity: !passed ? 'error' : (hasWarnings ? 'warning' : 'pass'),
    corrected: corrected || undefined,
    correctionLog: log,
  };
}

// ================================================================
// 便捷导出：单项校验（供单元测试/独立调用）
// ================================================================

export const gates = {
  roleCount: validateRoleCount,
  weightRange: validateWeightRange,
  protocolValidity: validateProtocolValidity,
  sceneConsistency: validateSceneConsistency,
  sourceVerification: validateSourceVerification,
  genomeQuality: validateGenomeQuality,
  confidenceIndependence: validateConfidenceIndependence,
};

/**
 * 从 validator.ts 适配的 7 条红线（适配版本）
 * 供外部审核/报告使用
 */
export function validateRedlinesAdapted(personaGenomes: PersonaGenomeBlue[]): Array<{
  ruleId: number;
  name: string;
  passed: boolean;
  severity: 'error' | 'warning' | 'info';
  detail: string;
}> {
  const results: Array<{ ruleId: number; name: string; passed: boolean; severity: 'error' | 'warning' | 'info'; detail: string }> = [];

  // 红线2: 约束→决策→框架三步骤完整（适配版）
  const incompleteModels: string[] = [];
  for (const pg of personaGenomes) {
    for (const mm of pg.mentalModels) {
      if (!mm.application || !mm.limitation || !mm.oneLiner) {
        incompleteModels.push(`${pg.roleName}/${mm.name}`);
      }
    }
  }
  results.push({
    ruleId: 2,
    name: '约束→决策→框架三步骤完整',
    passed: incompleteModels.length === 0,
    severity: incompleteModels.length === 0 ? 'info' : 'warning',
    detail: incompleteModels.length === 0
      ? '所有模型均包含 application / limitation / oneLiner'
      : `以下模型不完整：${incompleteModels.join('；')}`,
  });

  // 红线4: 诚实边界法则
  const allHaveBoundaries = personaGenomes.every(pg =>
    Array.isArray(pg.honestBoundaries) && pg.honestBoundaries.length > 0,
  );
  results.push({
    ruleId: 4,
    name: '诚实边界法则',
    passed: allHaveBoundaries,
    severity: allHaveBoundaries ? 'info' : 'warning',
    detail: allHaveBoundaries ? '所有角色有诚实边界' : '部分角色缺少诚实边界',
  });

  return results;
}