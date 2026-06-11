/**
 * engine-server/pipeline/phase-a-derive-roles.ts — Phase A (L1): 推导团队角色
 *
 * V1.3 重构：引擎驱动约束→框架→角色推导链（ARCH-00 §二 Phase A）
 *
 * Step 1: 约束分解（引擎）
 * Step 2: 约束→框架匹配（引擎，framework-library constraintPatterns）
 * Step 3: 框架→角色推导（引擎，framework-library applicableRoles）
 * Step 4: 角色汇总去重（引擎）
 * Step 5: LLM 填充细节（名字、职责、技能）—— LLM 不负责推导角色数量和类型
 * Step 6: DesignRationale 输出完整推理链
 *
 * 输入：TaskDefinitionDTO
 * 输出：TeamStructureBlue + IncubationFrame + DesignRationaleEntry[]
 */

import type { TaskDefinitionDTO, TeamStructureBlue, PhaseAResult, IncubationFrame, DesignRationaleEntry } from '../types';
import { PHASE_LABELS } from '../types';
import { chat } from '../llm-client';
import { checkGenericTrap, buildRetryPrompt } from './generic-trap-checker';
import { injectAmmo } from './phase-b/ammo-injector';

/** V1.5: 从约束中提取用户指定的团队规模 */
function extractTeamSizeFromConstraints(constraints: string[]): number | null {
  for (const c of constraints) {
    const m = c.match(/(\d+)\s*[人位个]/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 1 && n <= 50) return n;
    }
  }
  return null;
}

/** V1.6: 泛化vs专用策略评估 — 沈括 PyLabRobot/Opentrons 二分模式
 *
 *  评估用户描述的精确度，决定 Phase A 角色推导策略：
 *  - specialization (得分≥3): 需求具体 → Opentrons 模式，直接匹配+快速推导
 *  - generalization (得分<3): 需求宽泛 → PyLabRobot 模式，先探索情景+多角色推导
 */
export interface SpecificityResult {
  mode: 'generalization' | 'specialization';
  score: number;
  signals: string[];
  suggestion: string;
}

export function assessSpecificity(taskDef: TaskDefinitionDTO): SpecificityResult {
  let score = 0;
  const signals: string[] = [];

  const allText = [
    taskDef.job || '',
    ...(Array.isArray(taskDef.constraints) ? taskDef.constraints : []),
  ].join(' ');

  if (/Shopify|Amazon|淘宝|天猫|抖音|TikTok|Shopee|Lazada|独立站|自建站|小程序|公众号|APP\b|网站|SaaS平台|线下门店|连锁|加盟/.test(allText)) {
    score++; signals.push('平台/渠道明确');
  }
  if (/\bDTC\b|\bB2B\b|\bB2C\b|\bGMV\b|\bROI\b|\bROAS\b|\bCAC\b|\bLTV\b|转化率|复购率|SKU|供应链|物流|仓储|私域|公域|投流|买量/.test(allText)) {
    score++; signals.push('行业术语明确');
  }
  if (/(\d+)\s*[人位个名]|团队|招人|组建|已有.*[人位个名]|角色分工/.test(allText)) {
    score++; signals.push('团队规模/角色明确');
  }
  if (/预算|资金|投资|成本|月\d+万|年\d+万|\d+万\s*(美元|美金|人民币|元)|启动资金|融资/.test(allText)) {
    score++; signals.push('预算/规模明确');
  }
  if (/东南亚|欧美|北美|拉美|中东|非洲|日本|韩国|印度|巴西|墨西哥|印尼|越南|泰国|国内|本地|跨境|出海/.test(allText)) {
    score++; signals.push('市场/地域明确');
  }

  const mode = score >= 3 ? 'specialization' : 'generalization';
  return {
    mode,
    score,
    signals,
    suggestion: mode === 'specialization'
      ? '需求具体，走专用优化路径（Opentrons 模式：精准匹配框架+紧凑角色推导）'
      : '需求宽泛，走泛化推导路径（PyLabRobot 模式：探索完整情景+多角色覆盖）',
  };
}

import {
  matchFrameworksByConstraint,
  deriveRolesFromConstraints,
  clusterAndDedupRoles,
  detectAndResolveConflicts,
  type ConstraintFrameworkMatch,
  type DerivedRoleSource,
  type ClusteredRoleWithConflict,
} from './phase-b/framework-matcher';

// ================================================================
// Step 1-4: 引擎驱动约束→框架→角色推导
// ================================================================

/**
 * 约束优先级排序（V1.4: 麦肯锡七步法第3步 — 二八法则工程化）
 *
 * 排序规则（纯规则，不调 LLM）：
 *   规则1: 匹配 pareto_principle / opportunity_cost 的约束 → 最高优先级
 *   规则2: 资源型约束（预算、时间、人数、资金）→ 高于能力型约束（语言、技术栈）
 *   规则3: 外部合规性约束（法规、许可、认证）→ 不可降级的硬约束，排第二
 *
 * 资源型关键词 vs 能力型关键词的判断逻辑：
 *   资源型 = 有限/稀缺/可量化的投入要素（预算、时间、人数、资金、成本）
 *   能力型 = 可通过学习/招聘获取的技能要素（语言、技术栈、经验、知识）
 *   合规型 = 外部强制要求，不可通过内部决策改变（法规、认证、许可、关税）
 */
export function prioritizeConstraints(constraints: string[]): string[] {
  const sorted = [...constraints];

  sorted.sort((a, b) => {
    const priorityA = derivePriority(a);
    const priorityB = derivePriority(b);
    return priorityA - priorityB; // 数字越小优先级越高
  });

  return sorted;
}

function derivePriority(constraint: string): number {
  const text = constraint.toLowerCase();

  // 规则1: 匹配 pareto_principle / opportunity_cost → 最高优先级 (1)
  const topPriorityPatterns = [
    '资源', '预算', '资金', '有限', '聚焦', '取舍', '优先级',
    '成本', '钱', '省钱', '投入',
  ];
  if (topPriorityPatterns.some(p => text.includes(p))) return 1;

  // 规则3: 外部合规性约束 → 硬约束 (2)
  const compliancePatterns = [
    '合规', '法规', '认证', '许可', '关税', '海关', '法律',
    '制裁', '出口管制', '牌照', '资质', '审批',
  ];
  if (compliancePatterns.some(p => text.includes(p))) return 2;

  // 默认资源型约束 (3): 人数/时间/规模
  const resourcePatterns = [
    '人', '时间', '规模', '阶段', '从零', '扩张', '预算',
  ];
  if (resourcePatterns.some(p => text.includes(p))) return 3;

  // 市场/平台约束 (4)
  const marketPatterns = ['市场', '平台', '渠道', '国家', '地区', '跨境'];
  if (marketPatterns.some(p => text.includes(p))) return 4;

  // 能力型约束 (5): 语言/技术栈/技能
  return 5;
}

export interface EngineDerivationResult {
  /** Step 2: 每条约束匹配到的框架 */
  constraintMatches: ConstraintFrameworkMatch[];
  /** Step 3: 从框架 applicableRoles 提取的角色源 */
  derivedRoleSources: DerivedRoleSource[];
  /** Step 4: 聚合去重后的角色列表 */
  clusteredRoles: { roleType: string; sources: DerivedRoleSource[]; confidence: number }[];
  /** Step 4.5: 冲突检测拆分后的角色列表 */
  resolvedRoles: ClusteredRoleWithConflict[];
  /** 冲突拆分说明（供日志/notes） */
  conflictNotes: string[];
  /** 有多少条约束未能匹配到任何框架 */
  unmatchedConstraints: string[];
}

/**
 * Steps 1-4: 引擎驱动角色推导
 *
 * 约束分解 → 框架匹配 → 角色提取 → 聚合去重。
 * 完全在引擎侧完成，不调用 LLM。
 */
export function runEngineDerivation(taskDef: TaskDefinitionDTO): EngineDerivationResult {
  const rawConstraints = Array.isArray(taskDef.constraints) ? taskDef.constraints : [];

  // Step 1: 约束分解 + 优先级排序（V1.4: 资源型 > 能力型，合规不可降级）
  const constraints = prioritizeConstraints(rawConstraints);
  const allMatches: ConstraintFrameworkMatch[] = [];
  const unmatchedConstraints: string[] = [];

  for (const c of constraints) {
    const matches = matchFrameworksByConstraint(c);
    if (matches.length === 0) {
      unmatchedConstraints.push(c);
    } else {
      allMatches.push(...matches);
    }
  }

  // Step 2+3: 约束→框架→角色
  const derivedRoleSources = deriveRolesFromConstraints(constraints);

  // Step 4: 角色汇总去重
  const clusteredRoles = clusterAndDedupRoles(derivedRoleSources);

  // Step 4.5: 冲突检测与拆分
  const resolvedRoles = detectAndResolveConflicts(clusteredRoles);
  const conflictNotes: string[] = [];
  for (const rr of resolvedRoles) {
    if (rr.conflictNote) {
      conflictNotes.push(`${rr.roleType}: ${rr.conflictNote}`);
    }
  }

  return {
    constraintMatches: allMatches,
    derivedRoleSources,
    clusteredRoles,
    resolvedRoles,
    conflictNotes,
    unmatchedConstraints,
  };
}

// ================================================================
// 跨行业 few-shot 示例（冷启动备用 — LLM 填充细节时的参考）
// ================================================================

const COLD_START_EXAMPLES = `
以下示例展示了不同约束如何决定角色结构。请学习约束→角色的映射方法：

【示例 A · 美妆跨境电商】
约束: 3-5人, 需要懂西班牙语市场, 美妆品类标签合规, 墨西哥本地支付
→ 最终角色结构: 运营经理、合规专员、市场专员

【示例 B · 智慧农业 SaaS】
约束: 2-3人, 需要懂农业物联网, 需要做 SaaS 平台, 远程团队
→ 最终角色结构: 全栈工程师、产品经理

【示例 C · 连锁餐饮品牌】
约束: 3-5人起步, 需要本地食材供应链, 需要门店运营管理, 本地化口味
→ 最终角色结构: 门店经理、产品研发、运营助理
`;

// ================================================================
// Step 5: LLM 填充细节（引擎已确定角色类型，LLM 只填名字/职责/技能）
// ================================================================

function buildDetailFillPrompt(
  locale: string,
  clusteredRoles: { roleType: string; confidence: number }[],
  taskJob: string,
  isColdStart: boolean,
): string {
  const coldStartSection = isColdStart ? COLD_START_EXAMPLES : '';

  const roleTypeList = clusteredRoles
    .map((r, i) => `${i + 1}. ${r.roleType}（置信度: ${(r.confidence * 100).toFixed(0)}%）`)
    .join('\n');

  return `你是一个组织设计专家。引擎已经根据约束推导确定了团队需要的角色类型。你的任务是为这些角色**填充细节**——角色名称、职责描述和所需技能。

引擎确定的角色类型（不要修改数量和类型）：
${roleTypeList}

任务描述：${taskJob}

${coldStartSection}

请为以上每个角色类型填充：
- id: 英文 slug（如 "gongyinglian-guanli"）
- name: 角色中文名（2-5个字）
- responsibilities: 2-4项具体职责
- skillsRequired: 2-4项所需技能
- collaboratesWith: 需要协作的其他角色id列表
- governanceLayer: "L1_understanding" | "L2_execution" | "L3_governance"
- specialPrivileges: 如有特殊权限则描述

治理层分配原则：
- L3_governance（治理层）: 拥有最终决策权的角色，通常只有1个
- L2_execution（执行层）: 负责具体执行的角色，数量不限
- L1_understanding（理解层）: 负责信息收集和分析的角色

只输出 JSON：
{
  "roles": [
    {
      "id": "role-slug",
      "name": "角色中文名",
      "responsibilities": ["职责1", "职责2"],
      "skillsRequired": ["技能1", "技能2"],
      "collaboratesWith": ["other-role-slug"],
      "governanceLayer": "L2_execution",
      "specialPrivileges": []
    }
  ],
  "statusLine": "一行中文状态描述，不超过30字",
  "detail": "更详细的描述，不超过100字"
}

当前语言：${locale}`;
}

// ================================================================
// Step 5 fallback: LLM 全量推导（用于无约束或引擎匹配失败的场景）
// ================================================================

function buildFullDerivationPrompt(locale: string, isColdStart: boolean): string {
  const coldStartSection = isColdStart ? COLD_START_EXAMPLES : '';

  const reasoningChain = `
【约束标准化 → 约束分析 → 必备能力推导 → 能力→角色映射】（必做步骤，写在你的推理过程中）

步骤一 — 约束分析：逐条分析约束对团队结构意味着什么
步骤二 — 必备能力推导：这个任务必须具备哪些核心能力（3-6项）
步骤三 — 能力→角色映射：将必备能力归集到具体角色中
`;

  return `你是一个组织设计专家。根据用户的任务描述推导合适的团队角色结构。

${coldStartSection}${reasoningChain}

输出格式：
{
  "totalRoles": number,
  "recommendedTeamSize": number,
  "derivationMethod": "keyword_inference" | "cold_start" | "minimal_default",
  "roles": [
    {
      "id": "role-slug",
      "name": "角色中文名",
      "responsibilities": ["职责1", "职责2"],
      "skillsRequired": ["技能1", "技能2"],
      "collaboratesWith": ["role-slug-2"],
      "governanceLayer": "L1_understanding" | "L2_execution" | "L3_governance",
      "specialPrivileges": []
    }
  ],
  "statusLine": "一行中文状态描述，不超过30字",
  "detail": "更详细的描述，不超过100字"
}

角色设计原则：
1. 团队规模 3-5 人时，治理层 L3 只设 1 人
2. 角色职责不要重叠
3. 每个角色至少需要 1-2 项与其职责匹配的技能
4. id 用英文 slug（如 "yunying-zongjian"）

当前语言：${locale}`;
}

function buildUserPrompt(taskDef: TaskDefinitionDTO): string {
  const constraints = Array.isArray(taskDef.constraints) ? taskDef.constraints : [];
  const successMetrics = Array.isArray(taskDef.successMetrics) ? taskDef.successMetrics : [];
  const failureModes = Array.isArray(taskDef.failureModes) ? taskDef.failureModes : [];
  return `任务描述：${taskDef.job}
约束条件：${constraints.join('；') || '无'}
成功标准：${successMetrics.join('；') || '无'}
失败模式：${failureModes.join('；') || '无'}
阶段：${taskDef.stage}
置信度：${taskDef.confidence}

请只输出 JSON，不要输出其他内容。`;
}

// ================================================================
// JSON 解析
// ================================================================

import { extractJSON } from './llm-json-repair';
import { createLogger } from '../infra/logger';

const log = createLogger('engine-server/pipeline/phase-a-derive-roles');

// ================================================================
// JSON 解析降级 — LLM 两次都失败时用规则生成最低可用输出
// ================================================================

function buildFallbackRoleOutput(
  mode: 'detail_fill' | 'full_derivation',
  clusteredRoles: { roleType: string; confidence: number }[] | undefined,
  taskDef: TaskDefinitionDTO,
): any {
  const roles = (clusteredRoles && clusteredRoles.length > 0
    ? clusteredRoles
    : [{ roleType: '通用执行', confidence: 0.5 }, { roleType: '质量把关', confidence: 0.5 }]
  ).map((cr, i) => ({
    id: `role-fallback-${i}`,
    name: cr.roleType,
    responsibilities: [taskDef.job ? `参与执行: ${taskDef.job}` : '执行任务'],
    skillsRequired: ['通用技能'],
    collaboratesWith: [],
    governanceLayer: i === 0 ? 'L2_execution' : 'L3_governance',
  }));

  return {
    roles,
    totalRoles: roles.length,
    recommendedTeamSize: roles.length,
    derivationMethod: mode === 'detail_fill' ? 'keyword_inference' : 'cold_start_fallback',
    designRationale: {
      dimension: '降级回退',
      choice: `LLM 两次尝试均失败，规则生成 ${roles.length} 个角色`,
      reason: '基于引擎推导的角色类型或默认通用角色',
      sourceGap: 'LLM 不可用时的降级产物',
    },
  };
}

// ================================================================
// 主函数
// ================================================================

/**
 * 执行一次 LLM 调用并解析为 PhaseAResult
 *
 * @param mode - "detail_fill": LLM 只填细节（引擎已定角色类型）
 *               "full_derivation": LLM 全量推导（引擎匹配失败时的降级）
 */
async function executePhaseA(
  taskDef: TaskDefinitionDTO,
  locale: string,
  abortSignal: AbortSignal,
  isColdStart: boolean,
  mode: 'detail_fill' | 'full_derivation',
  clusteredRoles?: { roleType: string; confidence: number }[],
  retryPrompt?: string,
  diagnosisContext?: string,
): Promise<{ phaseA: PhaseAResult; parsed: any }> {
  let systemPrompt: string;
  let userMsg: string;

  // 弹药注入（L0 confirm 后，Phase A 前 — ARCH-00 §二 Phase A）
  const ammoText = injectAmmo(taskDef);

  if (mode === 'detail_fill' && clusteredRoles && clusteredRoles.length > 0) {
    systemPrompt = buildDetailFillPrompt(locale, clusteredRoles, taskDef.job, isColdStart) + ammoText + (diagnosisContext || '');
    userMsg = retryPrompt
      ? `请重新填充角色细节。${retryPrompt}`
      : `引擎已确定需要 ${clusteredRoles.length} 个角色类型。请为每个角色填充名称、职责和技能。`;
  } else {
    systemPrompt = buildFullDerivationPrompt(locale, isColdStart) + ammoText + (diagnosisContext || '');
    userMsg = retryPrompt
      ? buildUserPrompt(taskDef) + retryPrompt
      : buildUserPrompt(taskDef);
  }

  const result = await chat({
    systemPrompt,
    userMessage: userMsg,
    abortSignal,
    temperature: retryPrompt ? 0.5 : 0.7,
    maxTokens: diagnosisContext ? 16000 : 8000,
  });

  // JSON 提取 + 解析，带一次重试
  let parsed: any;
  try {
    const jsonStr = extractJSON(result.content);
    parsed = JSON.parse(jsonStr);
  } catch (parseErr) {
    log.warn(`[phase-a] JSON 解析失败，重试: ${(parseErr as Error).message}`);

    try {
      const retryResult = await chat({
        systemPrompt: systemPrompt + '\n\n注意：请确保返回严格合法的 JSON，不要包含注释或尾随逗号。',
        userMessage: `你上一次返回的 JSON 有语法错误: ${(parseErr as Error).message}\n\n请修正后重新返回完整的 JSON 对象。只返回 JSON。`,
        abortSignal,
        temperature: 0.3,
        maxTokens: diagnosisContext ? 16000 : 8000,
      });
      const jsonStr2 = extractJSON(retryResult.content);
      parsed = JSON.parse(jsonStr2);
    } catch (retryErr) {
      log.warn(`[phase-a] 重试仍失败，降级到规则推导: ${(retryErr as Error).message}`);
      parsed = buildFallbackRoleOutput(mode, clusteredRoles, taskDef);
    }
  }

  const designRationale = parsed.designRationale || {
    dimension: '约束分析→角色映射',
    choice: `[基于约束推导的团队结构: ${parsed.roles?.length || 3}个角色]`,
    reason: parsed.roles?.map((r: any) => `角色「${r.name}」: ${r.responsibilities?.join('、') || '通用'}`).join('；') || '推理过程由 LLM 内部完成',
    sourceGap: 'LLM 推理生成，未经验证',
  };

  const teamStructure: TeamStructureBlue = {
    totalRoles: parsed.totalRoles || parsed.roles?.length || 3,
    recommendedTeamSize: parsed.recommendedTeamSize || parsed.roles?.length || 3,
    derivationMethod: mode === 'detail_fill'
      ? 'keyword_inference'
      : (parsed.derivationMethod || 'cold_start'),
    roles: (parsed.roles || []).map((r: any) => ({
      id: r.id || `role-${Math.random().toString(36).slice(2, 6)}`,
      name: r.name || '未命名角色',
      responsibilities: Array.isArray(r.responsibilities) ? r.responsibilities : ['通用职责'],
      skillsRequired: Array.isArray(r.skillsRequired) ? r.skillsRequired : ['通用技能'],
      collaboratesWith: Array.isArray(r.collaboratesWith) ? r.collaboratesWith : [],
      governanceLayer: ['L1_understanding', 'L2_execution', 'L3_governance'].includes(r.governanceLayer)
        ? r.governanceLayer
        : 'L2_execution',
      specialPrivileges: Array.isArray(r.specialPrivileges) ? r.specialPrivileges : undefined,
    })),
    designRationale,
  };

  const incubationFrame: IncubationFrame = {
    phaseId: 'L1_derive_roles',
    phaseLabel: PHASE_LABELS.L1_derive_roles,
    progress: 20,
    statusLine: retryPrompt
      ? `重推后: 已识别 ${teamStructure.totalRoles} 个角色`
      : (parsed.statusLine || `已识别 ${teamStructure.totalRoles} 个角色`),
    detail: retryPrompt
      ? '退化检测触发重推'
      : (parsed.detail || `推荐 ${teamStructure.recommendedTeamSize} 人团队`),
  };

  const phaseA: PhaseAResult = { teamStructure, incubationFrame, llmRaw: result.content };
  return { phaseA, parsed };
}

// ================================================================
// Step 6: 组装 DesignRationaleEntry[]（推理过程外化）
// ================================================================

export function buildDesignRationale(
  engineResult: EngineDerivationResult | null,
  teamStructure: TeamStructureBlue,
  taskDef: TaskDefinitionDTO,
): DesignRationaleEntry[] {
  const entries: DesignRationaleEntry[] = [];

  if (engineResult && engineResult.resolvedRoles.length > 0) {
    // 为每个引擎推导的角色生成溯源条目（使用冲突拆分后的角色列表）
    for (const cr of engineResult.resolvedRoles) {
      const frameworks = cr.sources.map(s => s.sourceFramework.name).join('、');
      const constraints = [...new Set(cr.sources.map(s => s.sourceConstraint))].join('、');
      const isHypothesis = cr.confidence < 0.6;
      entries.push({
        dimension: `角色: ${cr.roleType}`,
        choice: `推导出角色类型「${cr.roleType}」（置信度: ${(cr.confidence * 100).toFixed(0)}%）`,
        alternatives: [],
        reason: `约束「${constraints}」→ 匹配框架「${frameworks}」→ 推导角色需求「${cr.roleType}」${cr.conflictNote ? ' [冲突拆分: ' + cr.conflictNote + ']' : ''}`,
        sourceGap: isHypothesis ? '约束关键词匹配较弱，框架映射可能存在偏差' : undefined,
        hypothesisTag: isHypothesis ? {
          statement: `角色「${cr.roleType}」仅由少量约束关键词推导，置信度 ${(cr.confidence * 100).toFixed(0)}%，需要用户确认该角色在此任务中是否必要`,
          confidence: cr.confidence,
          verificationNeeded: [
            `该角色在您的业务场景中是否确实必要？`,
            `该角色的职责是否有其他角色可以兼任？`,
          ],
          verified: false,
        } : undefined,
      });
    }

    // 记录未匹配的约束
    if (engineResult.unmatchedConstraints.length > 0) {
      entries.push({
        dimension: '未匹配约束',
        choice: `${engineResult.unmatchedConstraints.length} 条约束未匹配到框架`,
        alternatives: [],
        reason: `约束「${engineResult.unmatchedConstraints.join('、')}」在框架库中无对应 constraintPatterns`,
        sourceGap: '框架库覆盖不足，这些约束对应的角色由 LLM 补充',
      });
    }

    // 记录冲突拆分
    if (engineResult.conflictNotes.length > 0) {
      entries.push({
        dimension: '角色冲突拆分',
        choice: `${engineResult.conflictNotes.length} 个互斥域冲突被拆分`,
        alternatives: [],
        reason: engineResult.conflictNotes.join('; '),
        sourceGap: undefined,
      });
    }
  } else {
    // 引擎匹配失败的降级记录
    entries.push({
      dimension: '推导方法',
      choice: `降级为 LLM 全量推导（${teamStructure.derivationMethod}）`,
      alternatives: ['constraint_pattern_matching'],
      reason: taskDef.constraints?.length
        ? `约束「${taskDef.constraints.join('、')}」未能匹配框架库中的任何 constraintPattern`
        : '任务定义无约束条件',
      sourceGap: '引擎知识库覆盖不足，推理链不完整',
    });
  }

  return entries;
}

// ================================================================
// Phase A 主入口
// ================================================================

/**
 * Phase A 主入口（含退化检测 + 自动重推）
 *
 * 新流程:
 *   1. 引擎约束→框架→角色推导（Steps 1-4）
 *   2. LLM 填充角色细节（Step 5，引擎已确定角色类型）
 *   3. 退化检测 → 自动重推
 *   4. DesignRationale 组装（Step 6）
 *
 * 降级路径:
 *   - 如果约束为空或引擎匹配到 < 2 个角色 → 降级为 LLM 全量推导（保留旧行为）
 *   - 退化检测失败 → 自动重推（最多 2 次）
 */
export async function runPhaseA(
  taskDef: TaskDefinitionDTO,
  locale: string,
  abortSignal: AbortSignal,
  notes?: string[],
  diagnosisContext?: string,
): Promise<PhaseAResult> {
  const isColdStart = taskDef.stage === 'from_scratch';

  // ── V1.6: 泛化vs专用策略评估 ──
  const specificity = assessSpecificity(taskDef);
  if (notes) {
    notes.push(`特异性评估: ${specificity.mode === 'specialization' ? '专用(Opentrons)' : '泛化(PyLabRobot)'} (得分 ${specificity.score}/5, 信号: ${specificity.signals.join('、') || '无'})`);
  }

  // ── Steps 1-4.5: 引擎驱动推导 ──
  const engineResult = runEngineDerivation(taskDef);

  const useEngineDerivation = engineResult.resolvedRoles.length >= 2;
  const mode: 'detail_fill' | 'full_derivation' = useEngineDerivation ? 'detail_fill' : 'full_derivation';

  if (useEngineDerivation) {
    if (notes) {
      notes.push(`引擎推导: ${engineResult.resolvedRoles.length} 个角色类型 (${engineResult.resolvedRoles.map(r => r.roleType).join(', ')})`);
      const matchCount = engineResult.constraintMatches.length;
      notes.push(`约束→框架匹配: ${matchCount} 条匹配`);
      if (engineResult.unmatchedConstraints.length > 0) {
        notes.push(`未匹配约束: ${engineResult.unmatchedConstraints.join(', ')}`);
      }
      if (engineResult.conflictNotes.length > 0) {
        notes.push(`角色冲突拆分: ${engineResult.conflictNotes.join('; ')}`);
      }
    }
  } else {
    if (notes) notes.push(`引擎推导产出 ${engineResult.resolvedRoles.length} 个角色（<2），降级 LLM 全量推导`);
  }

  // ── Step 5: LLM 调用（使用冲突拆分后的角色列表）──
  // V1.5: 动态角色上限 — 根据用户指定的团队规模调整（不再永远 8 角色）
  // V1.6: 泛化模式放宽上限（多角色覆盖），专用模式收紧上限（紧凑精准）
  const userSpecifiedSize = extractTeamSizeFromConstraints(taskDef.constraints);
  const specificityMaxRoles = specificity.mode === 'specialization' ? 6 : 10;
  const maxRoles = userSpecifiedSize
    ? Math.min(userSpecifiedSize + (specificity.mode === 'specialization' ? 1 : 2), 15)
    : specificityMaxRoles;
  let resolvedForLLM = engineResult.resolvedRoles;
  if (resolvedForLLM.length > maxRoles) {
    resolvedForLLM = [...resolvedForLLM]
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, maxRoles);
    if (notes) notes.push(`⚠️ 引擎推导 ${engineResult.resolvedRoles.length} 个角色，超过上限${maxRoles}（用户指定${userSpecifiedSize || '未指定'}人），截取置信度最高的 ${maxRoles} 个`);
  }

  const clusteredForLLM = resolvedForLLM.map(cr => ({
    roleType: cr.roleType,
    confidence: cr.confidence,
  }));

  const { phaseA, parsed } = await executePhaseA(
    taskDef, locale, abortSignal, isColdStart, mode,
    useEngineDerivation ? clusteredForLLM : undefined,
    undefined, diagnosisContext,
  );

  // ── 退化检测 ──
  const roleIds = phaseA.teamStructure.roles.map(r => r.id);
  const roleNames = phaseA.teamStructure.roles.map(r => r.name);
  const trapCheck = checkGenericTrap(roleIds, roleNames, taskDef.constraints);

  let finalPhaseA = phaseA;

  if (!trapCheck.passes) {
    log.info(`[phase-a] 退化检测触发: ${trapCheck.reason}`);
    if (notes) notes.push(`退化检测触发: ${trapCheck.reason}`);

    for (let retry = 0; retry < 2; retry++) {
      const retryPrompt = buildRetryPrompt(trapCheck.specialConstraints!, taskDef.constraints);
      const retryResult = await executePhaseA(
        taskDef, locale, abortSignal, isColdStart, mode,
        useEngineDerivation ? clusteredForLLM : undefined,
        retryPrompt, diagnosisContext,
      );
      finalPhaseA = retryResult.phaseA;

      const newRoleIds = finalPhaseA.teamStructure.roles.map(r => r.id);
      const newRoleNames = finalPhaseA.teamStructure.roles.map(r => r.name);
      const reCheck = checkGenericTrap(newRoleIds, newRoleNames, taskDef.constraints);

      if (reCheck.passes) {
        if (notes) notes.push(`退化检测重推成功（第 ${retry + 1} 次）`);
        break;
      }

      if (retry === 1) {
        if (notes) notes.push(`退化检测重推 2 次后仍未通过，保留最后一次输出`);
      }
    }
  }

  // ── Step 6: DesignRationale 组装 ──
  const designRationale = buildDesignRationale(
    useEngineDerivation ? engineResult : null,
    finalPhaseA.teamStructure,
    taskDef,
  );

  // 将推理链注入 Phase A 结果
  finalPhaseA.designRationale = designRationale;

  // 同步写入 notes 供日志追溯
  if (notes) {
    for (const entry of designRationale) {
      notes.push(`[DesignRationale] ${entry.dimension}: ${entry.reason}`);
    }
  }

  return finalPhaseA;
}
