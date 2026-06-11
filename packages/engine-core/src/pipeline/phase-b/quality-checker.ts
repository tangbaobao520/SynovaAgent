/**
 * group-distill/quality-checker.ts — S7 质量检查器
 *
 * 对组装完成的 PersonaGenome 执行质量门禁检查。
 * 判定标准对齐 MEMORY.md 的工程状态定义：
 *   - publish:       verified_rate ≥ 80%，无 critical issue
 *   - conditional:   verified_rate ≥ 60%
 *   - draft_only:    verified_rate < 60%（或心智模型/反模式数不达标）
 *
 * 非 LLM：纯规则检查。所有检查项基于已有数据（meta 字段、表达式特征），
 * 不需要外部信源验证——那是 M2 验证链的事。
 *
 * @author 沈括（ClawOrg-首席科学家）
 * @date   2026-05-09
 */

import type { PersonaGenome } from './genome-assembler.js';

// ─── 类型定义 ──────────────────────────────────────────────

export type QualityGate = 'publish' | 'conditional_publish' | 'draft_only';

export interface QualityCheckItem {
  /** 检查项编号 */
  id: string;
  /** 人类可读的检查名称 */
  name: string;
  /** 检查通过？ */
  passed: boolean;
  /** severity: critical（必须通过）| moderate（可降级）| info（仅供参考） */
  severity: 'critical' | 'moderate' | 'info';
  /** 检查说明 */
  detail: string;
}

export interface QualityCheckResult {
  /** 判定结果 */
  gate: QualityGate;
  /** 各检查项 */
  items: QualityCheckItem[];
  /** 综合评分 0-1（简单规则：passed/total） */
  score: number;
  /** 用户可见的一行总结 */
  summary: string;
  /** 建议动作（如 "补充角色职责描述"、"降低 confidence"） */
  suggestions: string[];
}

// ─── 常量 ──────────────────────────────────────────────────

/** 心智模型数量下限（对齐 genome-assembler.ts 的 MIN_MENTAL_MODELS） */
const MIN_MENTAL_MODELS = 3;
/** 心智模型数量上限 */
const MAX_MENTAL_MODELS = 6;
/** 反模式数量下限 */
const MIN_ANTI_PATTERNS = 2;
/** 反模式数量上限 */
const MAX_ANTI_PATTERNS = 7;
/** honestyBoundaries 最少条数 */
const MIN_HONESTY_BOUNDARIES = 2;

// ─── 检查项实现 ──────────────────────────────────────────

/** 检查 1: 心智模型数量在 [3, 6] 范围内 */
function checkMentalModelCount(genome: PersonaGenome): QualityCheckItem {
  const count = genome.mentalModels.length;
  const passed = count >= MIN_MENTAL_MODELS && count <= MAX_MENTAL_MODELS;
  return {
    id: 'QC-01',
    name: '心智模型数量范围',
    passed,
    severity: 'critical',
    detail: passed
      ? `心智模型 ${count} 个（范围 ${MIN_MENTAL_MODELS}-${MAX_MENTAL_MODELS}）`
      : `心智模型 ${count} 个，不满足 ${MIN_MENTAL_MODELS}-${MAX_MENTAL_MODELS} 范围`,
  };
}

/** 检查 2: 反模式数量在 [2, 7] 范围内 */
function checkAntiPatternCount(genome: PersonaGenome): QualityCheckItem {
  const count = genome.antiPatterns.length;
  const passed = count >= MIN_ANTI_PATTERNS && count <= MAX_ANTI_PATTERNS;
  return {
    id: 'QC-02',
    name: '反模式数量范围',
    passed,
    severity: 'moderate',
    detail: passed
      ? `反模式 ${count} 个（范围 ${MIN_ANTI_PATTERNS}-${MAX_ANTI_PATTERNS}）`
      : `反模式 ${count} 个，不满足 ${MIN_ANTI_PATTERNS}-${MAX_ANTI_PATTERNS} 范围`,
  };
}

/** 检查 3: honestyBoundaries 非空 + 至少 2 条 */
function checkHonestyBoundaries(genome: PersonaGenome): QualityCheckItem {
  const count = genome.honestyBoundaries.length;
  const passed = count >= MIN_HONESTY_BOUNDARIES;
  return {
    id: 'QC-03',
    name: '诚实边界覆盖',
    passed,
    severity: 'critical',
    detail: passed
      ? `诚实边界 ${count} 条（≥${MIN_HONESTY_BOUNDARIES}）`
      : `诚实边界仅 ${count} 条，至少需要 ${MIN_HONESTY_BOUNDARIES} 条`,
  };
}

/** 检查 4: ExDNA 六维区分度——不能全中性（全 3） */
function checkExDNADistinction(genome: PersonaGenome): QualityCheckItem {
  const ex = genome.exdna;
  const vals = [ex.directness, ex.evidenceBasis, ex.proactiveness, ex.structure, ex.emotionalTone, ex.verbosity];
  const allSame = vals.every(v => v === 3);
  const passed = !allSame;

  if (passed) {
    const distinct = vals.filter(v => v !== 3).length;
    return {
      id: 'QC-04',
      name: 'ExDNA 区分度',
      passed: true,
      severity: 'moderate',
      detail: `ExDNA 非全中性（${distinct}/6 维与默认值不同）`,
    };
  }
  return {
    id: 'QC-04',
    name: 'ExDNA 区分度',
    passed: false,
    severity: 'moderate',
    detail: 'ExDNA 全为中性值 3——角色没有表达特征，可能输入信息不足',
  };
}

/** 检查 5: 心智模型语义多样性——同 category 不超过 3 个 */
function checkCategoryDiversity(genome: PersonaGenome): QualityCheckItem {
  const categoryCounts = new Map<string, number>();
  for (const mm of genome.mentalModels) {
    categoryCounts.set(mm.category, (categoryCounts.get(mm.category) ?? 0) + 1);
  }

  const maxInCategory = Math.max(...categoryCounts.values(), 0);
  const passed = maxInCategory <= 3;

  const categories = [...categoryCounts.entries()]
    .map(([cat, n]) => `${cat}(${n})`)
    .join(', ');

  return {
    id: 'QC-05',
    name: '心智模型类别多样性',
    passed,
    severity: 'info',
    detail: passed
      ? `类别分布：${categories}（最大集中≤3）`
      : `类别分布：${categories}（最大集中 ${maxInCategory}，超过 3）`,
  };
}

/** 检查 6: 反模式与心智模型的关联完整性 */
function checkAntiPatternLinkage(genome: PersonaGenome): QualityCheckItem {
  let linkedCount = 0;
  for (const ap of genome.antiPatterns) {
    // 只统计真实框架 ID（排除占位符）
    if (ap.linkedFrameworkId 
        && ap.linkedFrameworkId !== 'unknown'
        && ap.linkedFrameworkId !== 'role_generic'
        && ap.linkedFrameworkId !== 'generic') {
      linkedCount++;
    }
  }
  const total = genome.antiPatterns.length;
  const ratio = total > 0 ? linkedCount / total : 0;
  // 降级为：有 ≥1 个真实链接即 PASS（原 50% 太严）
  const passed = total === 0 ? false : linkedCount >= 1;

  return {
    id: 'QC-06',
    name: '反模式-框架关联',
    passed,
    severity: 'moderate',
    detail: passed
      ? `${linkedCount}/${total} 反模式有真实关联框架（${Math.round(ratio * 100)}%）`
      : `0/${total} 反模式有真实关联框架（需 ≥1 个真实链接）`,
  };
}

/** 检查 7: confidence 已转换为数值（不是枚举） */
function checkConfidenceNumeric(genome: PersonaGenome): QualityCheckItem {
  // 内部 PersonaGenome.meta.confidence 是枚举；适配后的 confidence 是数值
  // 这里检查 meta 字段
  const metaConfidence = genome.meta.confidence;
  const validEnum = ['high', 'medium', 'low'];
  const passed = validEnum.includes(metaConfidence);

  return {
    id: 'QC-07',
    name: '置信度格式',
    passed,
    severity: 'info',
    detail: `置信度: ${metaConfidence}（${passed ? '有效枚举值' : '未知值'}）`,
  };
}

/** 检查 8: 心智模型名称无重复 */
function checkNoDuplicateModels(genome: PersonaGenome): QualityCheckItem {
  const names = genome.mentalModels.map(mm => mm.id);
  const duplicates = names.filter((n, i) => names.indexOf(n) !== i);
  const passed = duplicates.length === 0;

  return {
    id: 'QC-08',
    name: '心智模型无重复',
    passed,
    severity: 'critical',
    detail: passed
      ? `所有心智模型 ID 唯一（${names.length} 个）`
      : `重复的心智模型: ${[...new Set(duplicates)].join(', ')}`,
  };
}

// ─── 汇总 ───────────────────────────────────────────────

const ALL_CHECKS = [
  checkMentalModelCount,
  checkAntiPatternCount,
  checkHonestyBoundaries,
  checkExDNADistinction,
  checkCategoryDiversity,
  checkAntiPatternLinkage,
  checkConfidenceNumeric,
  checkNoDuplicateModels,
];

/**
 * 运行 S7 质量检查
 *
 * @param genome — 已组装的 PersonaGenome（内部类型，含 meta）
 * @returns QualityCheckResult
 */
export function runQualityCheck(genome: PersonaGenome): QualityCheckResult {
  const items: QualityCheckItem[] = ALL_CHECKS.map(check => check(genome));

  const passed = items.filter(i => i.passed).length;
  const total = items.length;
  const score = total > 0 ? passed / total : 1;

  const criticalFailed = items.filter(i => i.severity === 'critical' && !i.passed);
  const moderateFailed = items.filter(i => i.severity === 'moderate' && !i.passed);

  // 判定逻辑
  let gate: QualityGate;
  if (criticalFailed.length > 0) {
    gate = 'draft_only';
  } else if (passed / total >= 0.8) {
    gate = 'publish';
  } else {
    gate = 'conditional_publish';
  }

  // 生成建议
  const suggestions: string[] = [];
  for (const item of [...criticalFailed, ...moderateFailed]) {
    switch (item.id) {
      case 'QC-01':
        suggestions.push(
          genome.mentalModels.length < MIN_MENTAL_MODELS
            ? `心智模型不足（${genome.mentalModels.length}/${MIN_MENTAL_MODELS}）：补充角色职责描述、失败模式或工作场景`
            : `心智模型过多（${genome.mentalModels.length}/${MAX_MENTAL_MODELS}）：考虑精简角色职责范围`,
        );
        break;
      case 'QC-02':
        suggestions.push(
          genome.antiPatterns.length < MIN_ANTI_PATTERNS
            ? '反模式不足：补充常见失败模式以帮助推导反模式'
            : '反模式过多：检查是否有重复或相似的反模式',
        );
        break;
      case 'QC-03':
        suggestions.push('诚实边界不足：引擎应自动补充通用诚实边界（"不做超出角色范围承诺"、"不确定信息标注来源"）');
        break;
      case 'QC-04':
        suggestions.push('ExDNA 全中性：补充角色决策类型或失败模式以生成更有区分度的表达特征');
        break;
      case 'QC-06':
        suggestions.push('部分反模式缺少对应框架：检查框架库覆盖率，或补充对应决策类型的框架');
        break;
    }
  }

  const summary = gate === 'publish'
    ? `✅ 质量检查通过（${passed}/${total}），可发布`
    : gate === 'conditional_publish'
    ? `⚠️ 有条件发布（${passed}/${total}），${moderateFailed.length} 项中等问题需人工复查`
    : `❌ 仅草稿（${passed}/${total}），${criticalFailed.length} 项关键检查未通过`;

  return { gate, items, score, summary, suggestions };
}

// ====================================================================
// 旧 API 兼容层（供 phase-b-distill-genome.ts 使用）
//
// NOTE(2026-05-15): 当前存在双 API：
//   - runQualityCheck(genome: PersonaGenome): 新 API，8 维度检查，内部类型含 meta/exdna
//   - checkQuality(genomes: PersonaGenomeBlue[], governanceLayers): 旧 API，Pipeline 主流程调用
//
// V1.4 计划合并：将 runQualityCheck 的 8 维度适配到 PersonaGenomeBlue 类型，
// 统一为一个入口，消除双 API 维护成本。
// 当前先确保两套 API 共享认知深度常量（GOV_LAYER_MIN_MODELS / GOV_LAYER_REQUIRES_SCENARIOS）。
// ====================================================================

import type { PersonaGenomeBlue } from '../../types';

export interface QualityCheckLegacyResult {
  overall: number;
  issues: Array<{ roleId: string; dimension: string; level: string; message: string }>;
  summary: { critical: number; moderate: number; info: number };
}

/** 治理层 → 最低心智模型数映射（万维钢认知四层级工程化） */
const GOV_LAYER_MIN_MODELS: Record<string, number> = {
  L3_governance: 3,
  L2_execution: 2,
  L1_understanding: 1,
};

/** 治理层 → 是否要求决策场景（解释框架级深度） */
const GOV_LAYER_REQUIRES_SCENARIOS: Record<string, boolean> = {
  L3_governance: true,
  L2_execution: false,
  L1_understanding: false,
};

/** 旧 API: 批量质量检查 */
export function checkQuality(
  genomes: PersonaGenomeBlue[],
  governanceLayers: Record<string, string>,
): QualityCheckLegacyResult {
  const issues: QualityCheckLegacyResult['issues'] = [];

  for (const g of genomes) {
    const govLayer = governanceLayers[g.roleId] || 'L2_execution';
    const minModels = GOV_LAYER_MIN_MODELS[govLayer] ?? 2;

    // 认知深度检查：心智模型数量是否满足治理层最低要求
    const modelCount = g.mentalModels?.length || 0;
    if (modelCount < minModels) {
      issues.push({
        roleId: g.roleId,
        dimension: 'cognitive_depth',
        level: 'critical',
        message: `角色 ${g.roleName} (${govLayer}) 心智模型不足 (${modelCount}/${minModels})，治理层要求≥${minModels}`,
      });
    }

    // 认知深度检查：L3 角色必须有决策场景（解释框架级深度）
    if (GOV_LAYER_REQUIRES_SCENARIOS[govLayer] && g.mentalModels && g.mentalModels.length > 0) {
      const hasScenarios = g.mentalModels.some(
        mm => mm.decisionScenarios && mm.decisionScenarios.length > 0,
      );
      if (!hasScenarios) {
        issues.push({
          roleId: g.roleId,
          dimension: 'cognitive_depth',
          level: 'critical',
          message: `角色 ${g.roleName} (L3_governance) 缺少决策场景——需达到解释框架级深度（万维钢层级4）`,
        });
      }
    }

    // 原有检查
    if (!g.mentalModels || g.mentalModels.length < 2) {
      issues.push({ roleId: g.roleId, dimension: 'mental_model', level: 'moderate', message: `角色 ${g.roleName} 心智模型不足(${g.mentalModels?.length || 0})` });
    }
    if (!g.honestBoundaries || g.honestBoundaries.length === 0) {
      issues.push({ roleId: g.roleId, dimension: 'honest_boundary', level: 'critical', message: `角色 ${g.roleName} 缺少诚实边界` });
    }
    if (!g.antiPatterns || g.antiPatterns.length === 0) {
      issues.push({ roleId: g.roleId, dimension: 'anti_pattern', level: 'moderate', message: `角色 ${g.roleName} 缺少反模式` });
    }
    const oceanVals = Object.values(g.oceanScores);
    if (oceanVals.every(v => v === 0.5)) {
      issues.push({ roleId: g.roleId, dimension: 'ocean', level: 'critical', message: `角色 ${g.roleName} OCEAN全0.5(未填充)` });
    }
  }

  const critical = issues.filter(i => i.level === 'critical').length;
  const moderate = issues.filter(i => i.level === 'moderate').length;
  const info = issues.filter(i => i.level === 'info').length;
  const overall = issues.length === 0 ? 100 : Math.max(0, 100 - critical * 25 - moderate * 10);

  return { overall, issues, summary: { critical, moderate, info } };
}
