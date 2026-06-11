/**
 * engine-server/pipeline/phase-c-select-mode.ts — Phase C (L3): 选择协作模式
 *
 * V1.3 重构：引擎侧协议选择 + LLM 填充 6 缝隙
 *
 * Step 1: 结构信号提取（引擎，从 TeamStructure + PersonaGenome 提取）
 * Step 2: 9 模式评分（引擎，按组织理论规则打分）
 * Step 3: 模式选定（引擎，最高分且领先≥2 → 确定；否则 top-2 → LLM 二选一）
 * Step 4: LLM 填充 6 缝隙细节（LLM 不负责选模式，只填缝隙参数）
 *
 * 输入：TaskDefinitionDTO + Phase A + Phase B 结果
 * 输出：CollaborationModeBlue（完整 6 缝隙 + safetyBaseline）+ IncubationFrame
 */

import type {
  TaskDefinitionDTO,
  PhaseAResult,
  PhaseBResult,
  PhaseCResult,
  CollaborationModeBlue,
  CollaborationMode,
  GapAuthorityGovernance,
  GapTrustIncentive,
  TeamStructureBlue,
  PersonaGenomeBlue,
  IncubationFrame,
} from '../types';
import { PHASE_LABELS } from '../types';
import { chat } from '../llm-client';
import { extractJSON } from './llm-json-repair';
import { checkCrossPersonaCoherence, formatConflictsForLLM, getCrossPersonaPenalties } from './cross-persona-checker';
import { createLogger } from '../infra/logger';

const log = createLogger('engine-server/pipeline/phase-c-select-mode');

// ================================================================
// Engine-side protocol selector (V1.3)
// ================================================================

const ALL_MODES: CollaborationMode[] = [
  'iron_captain', 'democratic_council', 'loose_federation',
  'cross_check_balance', 'bytedance_flat', 'haier_ren_dan_he_yi',
  'haidilao_frontline_auth', 'mckinsey_partnership', 'tencent_internal_race',
];

interface ProtocolSignals {
  totalRoles: number;
  l1Count: number;
  l2Count: number;
  l3Count: number;
  avgOpenness: number;
  avgConscientiousness: number;
  avgExtraversion: number;
  avgNeuroticism: number;
  hasCompliance: boolean;
  hasSpeedPriority: boolean;
  hasQualityPriority: boolean;
  hasInnovationPriority: boolean;
  hasCrossCultural: boolean;
  hasExternalDependency: boolean;
  isNewVenture: boolean;
}

interface ProtocolSelectionResult {
  mode: CollaborationMode;
  confidence: number;
  reason: string;
  scoredModes: Array<{ mode: CollaborationMode; score: number; reasons: string[] }>;
}

export function extractSignals(
  taskDef: TaskDefinitionDTO,
  phaseA: PhaseAResult,
  phaseB: PhaseBResult,
): ProtocolSignals {
  const roles = phaseA.teamStructure.roles;
  const genomes = phaseB.personaGenomes;
  const taskText = [taskDef.job, ...(taskDef.constraints || [])].join(' ').toLowerCase();

  const layerCounts = { L1_understanding: 0, L2_execution: 0, L3_governance: 0 };
  for (const r of roles) {
    if (r.governanceLayer in layerCounts) layerCounts[r.governanceLayer]++;
  }

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0.5;

  // V1.5: 从 constraints 中提取用户指定的团队规模（影响角色数量上限和协议选择）
  const userSpecifiedSize = extractTeamSizeFromConstraints(taskDef.constraints);
  const effectiveTeamSize = userSpecifiedSize ?? roles.length;

  return {
    totalRoles: effectiveTeamSize,
    l1Count: layerCounts.L1_understanding,
    l2Count: layerCounts.L2_execution,
    l3Count: layerCounts.L3_governance,
    avgOpenness: avg(genomes.map(g => g.oceanScores.openness)),
    avgConscientiousness: avg(genomes.map(g => g.oceanScores.conscientiousness)),
    avgExtraversion: avg(genomes.map(g => g.oceanScores.extraversion)),
    avgNeuroticism: avg(genomes.map(g => g.oceanScores.neuroticism)),
    hasCompliance: /合规|认证|审计|法务|安全审查|监管/.test(taskText),
    hasSpeedPriority: /快速|敏捷|效率|速度|快速迭代|加速/.test(taskText),
    hasQualityPriority: /质量|品质|稳定|可靠|精确/.test(taskText),
    hasInnovationPriority: /创新|探索|突破|研发|试错|验证/.test(taskText),
    hasCrossCultural: /跨境|跨文化|国际|多市场|本地化/.test(taskText),
    hasExternalDependency: /供应商|外包|合作伙伴|多平台|外部/.test(taskText),
    isNewVenture: taskDef.stage === 'from_scratch',
  };
}

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

// ================================================================
// V2.2: 任务约束加权（配合 QA 纪律性评估）
// ================================================================

/** 从约束字符串中提取月预算（美元），无法识别时返回 null */
export function extractBudgetFromConstraints(constraints: string[]): number | null {
  const text = constraints.join(' ');
  // $20K, $5K/month
  let m = text.match(/\$(\d+\.?\d*)\s*K/i);
  if (m) return parseFloat(m[1]) * 1000;
  // $5000, $20000 (dollar amounts)
  m = text.match(/\$(\d+\.?\d*)\s*(?:\/|per)?\s*month/i);
  if (m) return parseFloat(m[1]);
  // 预算：20万
  m = text.match(/预算[：:]\s*\$?(\d+\.?\d*)\s*万/);
  if (m) return parseFloat(m[1]) * 10000;
  // 20万 (Chinese unit without explicit 预算 prefix, but big enough to be budget)
  m = text.match(/(\d+)\s*万[元]?(?:\/|per)?\s*月/);
  if (m) return parseFloat(m[1]) * 10000 / 12; // yearly → monthly
  return null;
}

/** 检测约束中是否存在高敏感领域（安全/合规/医疗/金融）关键词 */
export function hasSensitiveDomain(taskText: string): boolean {
  return /安全|合规|医疗|金融|compliance|security|medical|finance|监管|审计|保险/.test(taskText);
}

/** 对加权项的百分比调整辅助：按当前分数的比例加减 */
function applyPctAdjustment(
  scored: Map<CollaborationMode, { score: number; reasons: string[] }>,
  mode: CollaborationMode,
  fraction: number,
  reasonLabel: string,
): void {
  const entry = scored.get(mode);
  if (!entry) return;
  const adjustment = Math.round(entry.score * fraction * 10) / 10; // 保留1位小数
  if (adjustment === 0) return;
  entry.score += adjustment;
  const sign = adjustment > 0 ? '+' : '';
  entry.reasons.push(`${reasonLabel} (${sign}${adjustment.toFixed(1)})`);
}

/**
 * V2.2: 任务约束加权 — 在引擎评分后对模式分数进行调整。
 *
 * 4 个维度：
 *   1. 团队规模（约束中提取，覆盖 signals.totalRoles）
 *   2. 预算（约束中提取，影响能否支撑大型协作）
 *   3. 项目阶段（from_scratch / expansion / optimization）
 *   4. 领域敏感性（安全/合规/医疗/金融 需更严格的审核门槛）
 */
function applyTaskConstraintWeightings(
  taskDef: TaskDefinitionDTO,
  signals: ProtocolSignals,
  scored: Map<CollaborationMode, { score: number; reasons: string[] }>,
): void {
  const constraintsText = (taskDef.constraints || []).join(' ').toLowerCase();
  const taskText = `${taskDef.job} ${constraintsText}`.toLowerCase();
  const teamSize = signals.totalRoles;

  // ── 1. 团队规模加权 ──
  if (teamSize <= 2) {
    // 团队≤2人时"内部赛马"无意义（不存在并行团队）
    applyPctAdjustment(scored, 'tencent_internal_race', -0.4, `团队仅${teamSize}人，赛马模式不适用`);
  }
  if (teamSize <= 3) {
    // 小团队减重企业级模式的权重
    for (const mode of ['loose_federation', 'cross_check_balance', 'tencent_internal_race', 'democratic_council'] as CollaborationMode[]) {
      applyPctAdjustment(scored, mode, -0.2, `小团队(${teamSize}人)减重企业级模式`);
    }
  }

  // ── 2. 预算加权 ──
  const monthlyBudget = extractBudgetFromConstraints(taskDef.constraints);
  if (monthlyBudget !== null && monthlyBudget < 5000) {
    for (const mode of ['iron_captain', 'bytedance_flat', 'haidilao_frontline_auth'] as CollaborationMode[]) {
      applyPctAdjustment(scored, mode, 0.2, `低预算($${monthlyBudget}/月)倾向轻量协作`);
    }
  }

  // ── 3. 阶段加权 ──
  if (taskDef.stage === 'from_scratch') {
    for (const mode of ['loose_federation', 'cross_check_balance', 'tencent_internal_race'] as CollaborationMode[]) {
      applyPctAdjustment(scored, mode, -0.15, '从零开始阶段避免大型组织模式');
    }
  } else if (taskDef.stage === 'optimization') {
    for (const mode of ['bytedance_flat', 'haidilao_frontline_auth', 'iron_captain'] as CollaborationMode[]) {
      applyPctAdjustment(scored, mode, 0.1, '优化阶段倾向增量式协作模式');
    }
  }

  // ── 4. 领域敏感性加权 ──
  if (hasSensitiveDomain(taskText)) {
    for (const mode of ['cross_check_balance', 'democratic_council'] as CollaborationMode[]) {
      applyPctAdjustment(scored, mode, 0.3, '安全/合规/医疗/金融领域增强审批模式');
    }
  }
}

export function scoreProtocolModes(
  s: ProtocolSignals,
): Map<CollaborationMode, { score: number; reasons: string[] }> {
  const scores = new Map<CollaborationMode, { score: number; reasons: string[] }>();
  for (const m of ALL_MODES) scores.set(m, { score: 0, reasons: [] });

  function add(m: CollaborationMode, pts: number, reason: string) {
    const entry = scores.get(m)!;
    entry.score += pts;
    entry.reasons.push(reason);
  }

  // ── iron_captain: 铁腕船长 — 小团队 + 层级分明 + 速度优先 ──
  if (s.totalRoles <= 5) add('iron_captain', 3, `团队≤5人(${s.totalRoles})`);
  if (s.totalRoles <= 3) add('iron_captain', 2, `微型团队(${s.totalRoles}人)`);
  if (s.l3Count === 1 && s.totalRoles >= 3) add('iron_captain', 2, '单一治理层角色');
  if (s.hasSpeedPriority) add('iron_captain', 2, '速度效率优先');
  if (s.avgNeuroticism > 0.45) add('iron_captain', 1, `高神经质(${s.avgNeuroticism.toFixed(2)})→集中决策降低焦虑`);

  // ── democratic_council: 民主议会 — 中型团队 + 多元意见 + 质量优先 ──
  if (s.totalRoles >= 4) add('democratic_council', 3, `团队≥4人(${s.totalRoles})`);
  if (s.totalRoles >= 6) add('democratic_council', 2, `较大团队(${s.totalRoles}人)`);
  if (s.hasQualityPriority) add('democratic_council', 2, '质量稳定优先');
  if (s.avgOpenness > 0.6) add('democratic_council', 1, `高开放性(${s.avgOpenness.toFixed(2)})→需要多元意见`);
  if (s.hasCrossCultural) add('democratic_council', 1, '跨文化场景→需要多方视角');

  // ── loose_federation: 松散联邦 — 大团队 + 高自律 + 低同步需求 ──
  if (s.totalRoles >= 6) add('loose_federation', 3, `大团队(${s.totalRoles}人)`);
  if (s.totalRoles >= 8) add('loose_federation', 2, `超大团队(${s.totalRoles}人)`);
  if (s.avgConscientiousness > 0.7) add('loose_federation', 2, `高尽责性(${s.avgConscientiousness.toFixed(2)})→成员自律`);
  if (s.avgOpenness > 0.65) add('loose_federation', 1, '高开放性→适应自主');

  // ── cross_check_balance: 交叉校验 — 合规/安全/审计场景 ──
  if (s.hasCompliance) add('cross_check_balance', 4, '合规/安全/审计需求');
  if (s.l3Count >= 2) add('cross_check_balance', 1, '多治理层角色→需要互审');
  if (s.avgConscientiousness > 0.7) add('cross_check_balance', 1, `高尽责性(${s.avgConscientiousness.toFixed(2)})`);
  if (s.avgNeuroticism > 0.5) add('cross_check_balance', 1, `高神经质(${s.avgNeuroticism.toFixed(2)})→需要校验缓解焦虑`);

  // ── bytedance_flat: 字节扁平 — 信息密集 + 产品型 + 快速迭代 ──
  if (s.hasInnovationPriority && s.hasSpeedPriority) add('bytedance_flat', 4, '创新+速度双驱动');
  if (s.hasInnovationPriority) add('bytedance_flat', 2, '创新探索优先');
  if (s.hasSpeedPriority) add('bytedance_flat', 2, '快速迭代');
  if (s.avgOpenness > 0.7) add('bytedance_flat', 2, `高开放性(${s.avgOpenness.toFixed(2)})→信息自由流动`);
  if (s.l2Count >= 3) add('bytedance_flat', 1, `执行层≥3(${s.l2Count})`);

  // ── haier_ren_dan_he_yi: 海尔人单合一 — 面向终端客户 + 多BU ──
  if (s.hasExternalDependency) add('haier_ren_dan_he_yi', 3, '外部依赖→需要面向客户');
  if (s.hasCrossCultural) add('haier_ren_dan_he_yi', 2, '跨文化/多市场');
  if (s.avgExtraversion > 0.6) add('haier_ren_dan_he_yi', 1, `高外倾性(${s.avgExtraversion.toFixed(2)})`);

  // ── haidilao_frontline_auth: 海底捞一线授权 — 服务质量 + 一线决策 ──
  if (s.hasQualityPriority) add('haidilao_frontline_auth', 3, '服务质量关键');
  if (s.l2Count >= 3) add('haidilao_frontline_auth', 2, `执行层≥3(${s.l2Count})→需要一线授权`);
  if (s.avgExtraversion > 0.55) add('haidilao_frontline_auth', 1, `高外倾性(${s.avgExtraversion.toFixed(2)})`);

  // ── mckinsey_partnership: 麦肯锡合伙人 — 专家驱动 + 项目制 + 高附加值 ──
  if (s.totalRoles <= 5 && s.l3Count === 1) add('mckinsey_partnership', 3, `精英小团队(${s.totalRoles}人, 1治理层)`);
  if (s.isNewVenture) add('mckinsey_partnership', 2, '新创→需要专家驱动');
  if (s.avgOpenness > 0.6 && s.avgConscientiousness > 0.65) add('mckinsey_partnership', 2, '高开+高责→专家型团队特征');

  // ── tencent_internal_race: 腾讯内部赛马 — 战略窗口 + 高不确定性 ──
  if (s.hasInnovationPriority && s.isNewVenture) add('tencent_internal_race', 5, '新创+创新→并行验证');
  if (s.hasInnovationPriority) add('tencent_internal_race', 3, '创新优先→多方案并行');
  if (s.hasSpeedPriority && s.isNewVenture) add('tencent_internal_race', 2, '新创+速度→赛马缩短验证周期');
  if (s.totalRoles >= 5) add('tencent_internal_race', 1, `团队≥5(${s.totalRoles}人)→可拆分并行`);

  return scores;
}

export function selectProtocol(
  scored: Map<CollaborationMode, { score: number; reasons: string[] }>,
  signals: ProtocolSignals,
  team: TeamStructureBlue,
  genomes: PersonaGenomeBlue[],
): ProtocolSelectionResult {
  // 跨角色兼容性扣分（从外部传入的 scored 已有约束加权，此处只加冲突扣分）
  const crossPersonaPenalties = getCrossPersonaPenalties(team, genomes);
  for (const [mode, penalty] of crossPersonaPenalties) {
    const entry = scored.get(mode);
    if (entry && penalty > 0) {
      entry.score -= penalty;
      entry.reasons.push(`跨角色冲突扣分: -${penalty}`);
    }
  }

  const ranked = Array.from(scored.entries())
    .map(([mode, { score, reasons }]) => ({ mode, score, reasons }))
    .sort((a, b) => b.score - a.score);

  const top = ranked[0];
  const second = ranked[1];

  // 领先 ≥2 分 → 高置信度确定；否则标注为 medium
  const leadMargin = top.score - second.score;
  const confidence = leadMargin >= 2 ? 0.85 : 0.55;

  const reason = `[${top.mode}] 得分 ${top.score} (领先第2名 ${second.mode} ${leadMargin} 分): ${top.reasons.join('; ')}`;

  return {
    mode: top.mode,
    confidence,
    reason,
    scoredModes: ranked,
  };
}

// ================================================================
// System Prompt（LLM只填6缝隙，不选模式）
// ================================================================

function buildSystemPrompt(locale: string, selectedMode: CollaborationMode): string {
  return `你是一个组织理论专家。引擎已选定协作模式为「${selectedMode}」。你的任务是为该模式设计完整的 6 缝隙协作协议参数。

你必须输出严格格式的 JSON。不要输出其他内容。不要修改 mode 字段。

协作模式枚举（9 种，供理解当前模式特征）：
- iron_captain: 铁腕船长 — 一人决策，全员执行
- democratic_council: 民主议会 — 多数投票决定
- loose_federation: 松散联邦 — 高度自主，按需协作
- cross_check_balance: 交叉校验 — 双人互审，防止偏差
- bytedance_flat: 字节扁平 — 信息自由流动，项目驱动
- haier_ren_dan_he_yi: 海尔人单合一 — 全员面向用户，自主经营
- haidilao_frontline_auth: 海底捞一线授权 — 前线决策权极大
- mckinsey_partnership: 麦肯锡合伙人 — 专家决策，项目制
- tencent_internal_race: 腾讯内部赛马 — 多团队并行竞争

输出格式：
{
  "mode": "${selectedMode}",
  "label": "中文标签",
  "description": "模式描述",
  "selectionReason": "为什么选这个模式（引擎已选定，这里解释其合理性）",
  "divisionOfLabor": { ... },
  "informationFlow": { ... },
  "conflictResolution": { ... },
  "powerDistribution": { ... },
  "incentiveAlignment": { ... },
  "trustModel": { ... },
  "knowledgeSharing": { ... },
  "externalInterface": { ... },
  "safetyBaseline": { ... },
  "statusLine": "一行中文状态描述",
  "detail": "更详细的描述"
}

6 缝隙设计原则（请严格对照选定模式的特征来填充）：
1. divisionOfLabor — 劳动分工: 模式决定 fixed/flexible/morphing，角色可替代性
2. informationFlow — 信息流: 模式决定 topology(chain/star/full_mesh/hierarchical) 和 syncMode
3. conflictResolution — 冲突解决: 模式决定 strategy(single_decider/majority_vote/consensus/escalation)
4. powerDistribution — 权力分布: 模式决定 authority(flat/hierarchical/domain_based/federal/collegial/decentralized)
5. incentiveAlignment — 激励对齐: 模式决定 reward/penalty/mixed
6. trustModel — 信任模型: 模式决定初始信任和更新机制
7. knowledgeSharing — 知识共享: 模式决定策略和同步间隔
8. externalInterface — 外部接口: 模式决定对外策略(gatekeeper/ambassador/buffer/open_door)

当前语言：${locale}`;
}

// ================================================================
// User Prompt
// ================================================================

function buildUserPrompt(
  taskDef: TaskDefinitionDTO,
  phaseA: PhaseAResult,
  phaseB: PhaseBResult,
  selectedMode: CollaborationMode,
  engineReason: string,
  conflictHints: string,
): string {
  const rolesDesc = phaseA.teamStructure.roles
    .map((r) => `  - ${r.id}: ${r.name} (${r.governanceLayer})`)
    .join('\n');

  const genomeSummary = phaseB.personaGenomes
    .map((g) => `  - ${g.roleName}: O${g.oceanScores.openness} C${g.oceanScores.conscientiousness} E${g.oceanScores.extraversion} A${g.oceanScores.agreeableness} N${g.oceanScores.neuroticism}`)
    .join('\n');

  const conflictSection = conflictHints && conflictHints !== '未检测到角色间兼容性冲突。'
    ? `\n⚠️ 跨角色兼容性警告（请在填充 6 缝隙时考虑以下冲突的缓解措施）：\n${conflictHints}\n`
    : '';

  return `请为以下团队设计「${selectedMode}」模式的 6 缝隙协作协议：

任务：${taskDef.job}
约束：${taskDef.constraints.join('；')}
失败模式：${taskDef.failureModes.join('；') || '无'}

引擎选择理由：${engineReason}
${conflictSection}
团队角色：
${rolesDesc}

角色认知特征：
${genomeSummary}

请为选定模式填充 6 缝隙参数。在填充缝隙值时，请参考以上兼容性警告来调整参数以缓解冲突。只输出 JSON。`;
}

// ================================================================
// 主函数
// ================================================================

export async function runPhaseC(
  taskDef: TaskDefinitionDTO,
  phaseA: PhaseAResult,
  phaseB: PhaseBResult,
  locale: string,
  abortSignal: AbortSignal,
): Promise<PhaseCResult> {
  // ── Steps 1-2: 引擎侧信号提取 + 模式评分 ──
  const signals = extractSignals(taskDef, phaseA, phaseB);
  const scored = scoreProtocolModes(signals);

  // ── Step 2.5 (V2.2): 任务约束加权 — 团队规模/预算/阶段/领域敏感性 ──
  applyTaskConstraintWeightings(taskDef, signals, scored);

  // ── Step 3: 模式选定（含跨角色兼容性扣分）──
  const selection = selectProtocol(scored, signals, phaseA.teamStructure, phaseB.personaGenomes);

  // 对选定模式执行跨角色冲突检测（用于 LLM 提示词）
  const crossPersonaReport = checkCrossPersonaCoherence(
    phaseA.teamStructure,
    phaseB.personaGenomes,
    selection.mode,
  );
  const conflictHints = formatConflictsForLLM(crossPersonaReport);

  log.info(`[phase-c] 引擎协议选择: ${selection.reason} | 跨角色内洽: ${crossPersonaReport.overallScore}/100 (${crossPersonaReport.conflicts.length}冲突)`);

  // ── Step 4: LLM 填充 6 缝隙（模式已定，含冲突缓解提示）──
  let parsed: any;
  let llmRaw: string;
  try {
    const result = await chat({
      systemPrompt: buildSystemPrompt(locale, selection.mode),
      userMessage: buildUserPrompt(taskDef, phaseA, phaseB, selection.mode, selection.reason, conflictHints),
      abortSignal,
      temperature: 0.6,
      maxTokens: 16000,
    });
    llmRaw = result.content;
    const jsonStr = extractJSON(llmRaw);
    parsed = JSON.parse(jsonStr);
  } catch (llmErr) {
    log.warn(`[phase-c] LLM 填充 6 缝隙失败，降级到引擎默认: ${(llmErr as Error).message}`);
    llmRaw = `[phase-c fallback] ${(llmErr as Error).message}`;
    parsed = { mode: selection.mode, label: selection.mode };
  }

  const safeCR = safeConflictResolution(parsed.authorityGovernance);
  const safePD = safePowerDistribution(parsed.authorityGovernance);
  const safeIA = safeIncentiveAlignment(parsed.trustIncentive);
  const safeTM = safeTrustModel(parsed.trustIncentive);

  const collaborationMode: CollaborationModeBlue = {
    mode: ALL_MODES.includes(parsed.mode) ? parsed.mode : selection.mode,
    label: parsed.label || selection.mode,
    description: parsed.description || '引擎选定模式',
    selectionReason: parsed.selectionReason || selection.reason,
    divisionOfLabor: safeDivisionOfLabor(parsed.divisionOfLabor),
    informationFlow: safeInformationFlow(parsed.informationFlow),
    // 8-gap deprecated bridge
    conflictResolution: {
      strategy: safeCR.strategy || 'escalation',
      deadlockTimeoutSeconds: safeCR.deadlockTimeoutSeconds || 300,
      deciderRoleId: safeCR.deciderRoleId,
      escalationPath: safeCR.escalationPath,
    },
    powerDistribution: {
      authority: safePD.authority || 'hierarchical',
      hasVeto: safePD.hasVeto ?? false,
      vetoRoles: safePD.vetoRoles,
      decisionFlow: safePD.decisionFlow,
    },
    incentiveAlignment: {
      alignment: safeIA.alignment || 'mixed',
      successSignal: safeIA.successSignal || '',
      failureSignal: safeIA.failureSignal || '',
    },
    trustModel: {
      initialTrust: safeTM.initialTrust || 'medium',
      updateMechanism: safeTM.updateMechanism || 'merit_based',
      degradationTriggers: safeTM.degradationTriggers,
    },
    // 6-gap unified
    authorityGovernance: {
      ...safeCR,
      ...safePD,
    } as GapAuthorityGovernance,
    trustIncentive: {
      ...safeIA,
      ...safeTM,
    } as GapTrustIncentive,
    knowledgeSharing: safeKnowledgeSharing(parsed.knowledgeSharing),
    externalInterface: safeExternalInterface(parsed.externalInterface),
    safetyBaseline: safeSafetyBaseline(parsed.safetyBaseline, [taskDef.job, ...(taskDef.constraints || [])].join(' ')),
  };

  // 6 缝隙一致性修正：修复已知矛盾组合
  enforceGapConsistency(collaborationMode);

  const incubationFrame: IncubationFrame = {
    phaseId: 'L3_select_mode',
    phaseLabel: PHASE_LABELS.L3_select_mode,
    progress: 60,
    statusLine: parsed.statusLine || `已选择「${collaborationMode.label}」协作模式`,
    detail: parsed.detail || collaborationMode.selectionReason,
  };

  return { collaborationMode, incubationFrame, llmRaw };
}

// ================================================================
// Safe parsers（防御 LLM 输出格式错误）
// ================================================================

export function safeDivisionOfLabor(d: any): CollaborationModeBlue['divisionOfLabor'] {
  const validModes = ['fixed', 'flexible', 'morphing'];
  return {
    mode: validModes.includes(d?.mode) ? d.mode : 'flexible',
    substitutable: typeof d?.substitutable === 'boolean' ? d.substitutable : true,
    roleAssignment: d?.roleAssignment,
    fallbackRoles: d?.fallbackRoles,
  };
}

function safeInformationFlow(i: any): CollaborationModeBlue['informationFlow'] {
  const validTopologies = ['chain', 'star', 'full_mesh', 'hierarchical'];
  const validSyncModes = ['round_robin', 'free_form', 'moderated'];
  return {
    topology: validTopologies.includes(i?.topology) ? i.topology : 'star',
    syncMode: validSyncModes.includes(i?.syncMode) ? i.syncMode : 'round_robin',
    visibilityMatrix: i?.visibilityMatrix,
    routingMap: i?.routingMap,
  };
}

export function safeConflictResolution(c: any): Partial<CollaborationModeBlue['authorityGovernance']> {
  const validStrategies = ['majority_vote', 'single_decider', 'consensus', 'escalation'];
  return {
    strategy: validStrategies.includes(c?.strategy) ? c.strategy : 'single_decider',
    deadlockTimeoutSeconds: typeof c?.deadlockTimeoutSeconds === 'number' ? c.deadlockTimeoutSeconds : 300,
    deciderRoleId: c?.deciderRoleId,
    escalationPath: c?.escalationPath,
  };
}

function safePowerDistribution(p: any): Partial<CollaborationModeBlue['authorityGovernance']> {
  const validAuthorities = ['flat', 'hierarchical', 'domain_based', 'federal', 'collegial', 'decentralized'];
  return {
    authority: validAuthorities.includes(p?.authority) ? p.authority : 'hierarchical',
    hasVeto: typeof p?.hasVeto === 'boolean' ? p.hasVeto : true,
    vetoRoles: p?.vetoRoles,
    decisionFlow: p?.decisionFlow,
  };
}

function safeIncentiveAlignment(i: any): Partial<CollaborationModeBlue['trustIncentive']> {
  const validAlignments = ['reward', 'penalty', 'mixed'];
  return {
    alignment: validAlignments.includes(i?.alignment) ? i.alignment : 'mixed',
    successSignal: i?.successSignal || '达成目标',
    failureSignal: i?.failureSignal || '未达成目标',
  };
}

function safeTrustModel(t: any): Partial<CollaborationModeBlue['trustIncentive']> {
  const validInitialTrust = ['low', 'medium', 'high'];
  const validMechanisms = ['merit_based', 'seniority_based', 'fixed'];
  return {
    initialTrust: validInitialTrust.includes(t?.initialTrust) ? t.initialTrust : 'high',
    updateMechanism: validMechanisms.includes(t?.updateMechanism) ? t.updateMechanism : 'merit_based',
    degradationTriggers: t?.degradationTriggers,
  };
}

function safeKnowledgeSharing(k: any): CollaborationModeBlue['knowledgeSharing'] {
  const validStrategies = ['central_repo', 'pair_sharing', 'downward_pour', 'free_for_all'];
  return {
    strategy: validStrategies.includes(k?.strategy) ? k.strategy : 'free_for_all',
    syncIntervalHours: typeof k?.syncIntervalHours === 'number' ? k.syncIntervalHours : 24,
    hasTacitKnowledge: typeof k?.hasTacitKnowledge === 'boolean' ? k.hasTacitKnowledge : false,
  };
}

function safeExternalInterface(e: any): CollaborationModeBlue['externalInterface'] {
  const validStrategies = ['gatekeeper', 'ambassador', 'buffer', 'open_door'];
  return {
    strategy: validStrategies.includes(e?.strategy) ? e.strategy : 'gatekeeper',
    canBypassProtocol: typeof e?.canBypassProtocol === 'boolean' ? e.canBypassProtocol : false,
    auditLogEnabled: typeof e?.auditLogEnabled === 'boolean' ? e.auditLogEnabled : true,
    authorizedRoles: e?.authorizedRoles,
  };
}

function safeSafetyBaseline(
  s: any,
  taskText?: string,
): CollaborationModeBlue['safetyBaseline'] {
  const validLevels = ['low', 'medium', 'high'];

  // V1.5: 任务特定的默认审批项（不再硬编码模板）
  const defaultApprovals = deriveDefaultApprovals(taskText || '');

  return {
    requireHumanApproval: Array.isArray(s?.requireHumanApproval) && s.requireHumanApproval.length > 0
      ? s.requireHumanApproval
      : defaultApprovals,
    auditLogEnabled: typeof s?.auditLogEnabled === 'boolean' ? s.auditLogEnabled : true,
    maxAutonomyLevel: validLevels.includes(s?.maxAutonomyLevel) ? s.maxAutonomyLevel : 'medium',
  };
}

/** V1.5: 按任务关键词推导需人工审批的操作 */
export function deriveDefaultApprovals(taskText: string): string[] {
  const approvals: string[] = [];

  // 数据与隐私
  if (/数据|隐私|个人信息|用户数据|数据出境|数据跨境/.test(taskText)) approvals.push('数据访问与隐私合规审批');
  // 部署与发布
  if (/部署|上线|发布|生产环境|上线|发版/.test(taskText)) approvals.push('生产部署与版本发布审批');
  // 合规与认证（通用）
  if (/合规|认证|法规|监管|审计|许可|牌照/.test(taskText)) approvals.push('合规审计与监管报批');
  // 资金与支付
  if (/资金|转账|支付|付款|交易|结算|汇款/.test(taskText)) approvals.push('资金操作与支付审批');
  // 合同与法律
  if (/合同|签署|签约|协议|盖章|法务/.test(taskText)) approvals.push('合同签署与法律文件审批');
  // 外部通信与客户
  if (/外部|客户|用户|公开|对外|品牌|媒体/.test(taskText)) approvals.push('对外通信与客户承诺审批');

  // 领域特定风险
  // 医疗/生物/制药
  if (/临床|试验|患者|病人|药品|药械|治疗|诊断|手术|医疗|基因|遗传|生物|病毒|疫苗|人体|血液/.test(taskText)) {
    approvals.push('临床试验与伦理审查');
    approvals.push('生物安全与遗传资源审批');
    if (/器械|设备|硬件|可穿戴/.test(taskText)) approvals.push('医疗器械认证与备案审批');
  }
  // AI/算法
  if (/AI|人工智能|算法|模型|机器学习|深度学习|大模型|LLM|GPT|神经网络/.test(taskText)) {
    approvals.push('AI模型安全评估与算法备案');
    if (/安全|红队|对抗|攻击|越狱|注入/.test(taskText)) approvals.push('AI安全测试与红队审计审批');
  }
  // 金融/投资
  if (/金融|投资|理财|基金|证券|期货|保险|贷款|风控|信用/.test(taskText)) {
    approvals.push('金融产品合规与风控审批');
    if (/量化|交易|策略|回测|实盘/.test(taskText)) approvals.push('量化策略实盘审批与回撤控制');
  }
  // 教育/培训
  if (/教育|培训|课程|教学|学员|学生|考试|认证|毕业/.test(taskText)) {
    approvals.push('课程内容审核与教学质量审批');
  }
  // 餐饮/食品
  if (/餐饮|食品|餐厅|火锅|厨房|食材|菜品|加盟/.test(taskText)) {
    approvals.push('食品安全与卫生合规审批');
    if (/加盟|特许/.test(taskText)) approvals.push('加盟商资质与合同审批');
  }
  // 制造/工业
  if (/制造|工厂|生产|产线|设备|机器|工艺|质检/.test(taskText)) {
    approvals.push('生产安全与设备变更审批');
    if (/ERP|MES|数字化|改造/.test(taskText)) approvals.push('系统改造与数据迁移审批');
  }
  // 供应链/物流
  if (/供应链|物流|仓储|库存|采购|供货|配送/.test(taskText)) {
    approvals.push('供应链关键节点变更审批');
  }
  // 航天/太空
  if (/航天|太空|卫星|轨道|发射|空间|火箭|在轨/.test(taskText)) {
    approvals.push('航天任务安全与发射审批');
    if (/国际|条约|空间法/.test(taskText)) approvals.push('国际空间法合规审查');
  }
  // DAO/加密/区块链
  if (/DAO|去中心化|区块链|加密|智能合约|代币|治理.*投票/.test(taskText)) {
    approvals.push('智能合约安全审计与多签审批');
    if (/USDC|USDT|稳定币|资金池/.test(taskText)) approvals.push('资金池操作与多签审批');
  }
  // 跨境/国际
  if (/跨境|海外|出海|东南亚|东盟|欧盟|美国|日本|国际|多国|本地化/.test(taskText)) {
    approvals.push('跨境合规与本地化法规审批');
    if (/数据|隐私/.test(taskText)) approvals.push('跨境数据传输与数据主权审批');
  }

  // 兜底
  return approvals.length > 0 ? approvals : ['关键业务决策审批', '外部通信审批'];
}

/**
 * 6 缝隙一致性修正：检测并修复 LLM 生成的矛盾组合。
 *
 * V1.5 扩展至 7 种矛盾模式（原 3 种 + 新增 4 种）：
 *   1. 层级信息流 + 扁平权力 → 统一为层级权力
 *   2. 单一决策者 + 扁平权力 → 统一为层级权力
 *   3. 层级信息流 + 共识决策 → 冲突解决改为多数投票
 *   4. ★ 扁平权力 + 链式信息流 → 信息流改为全网格
 *   5. ★ 共识决策 + 层级权力 → 权力改为合议制
 *   6. ★ 松散联邦 + 守门人外部接口 → 外部接口改为公开
 *   7. ★ 单一决策者 + 全网格信息流 → 信息流改为星型
 */
export function enforceGapConsistency(cm: CollaborationModeBlue): void {
  const infoHierarchical = cm.informationFlow.topology === 'hierarchical';
  const infoChain = cm.informationFlow.topology === 'chain';
  const infoFullMesh = cm.informationFlow.topology === 'full_mesh';
  const infoStar = cm.informationFlow.topology === 'star';
  const conflictSingleDecider = cm.authorityGovernance.strategy === 'single_decider';
  const conflictConsensus = cm.authorityGovernance.strategy === 'consensus';
  const powerFlat = cm.authorityGovernance.authority === 'flat';
  const powerHierarchical = cm.authorityGovernance.authority === 'hierarchical';
  const externalGatekeeper = cm.externalInterface.strategy === 'gatekeeper';

  // 矛盾 1: 信息流层级化 但 权力扁平化 → 权力改为层级化
  if (infoHierarchical && powerFlat) {
    cm.authorityGovernance.authority = 'hierarchical';
    log.info('[phase-c] 6缝隙一致性修正: 信息流hierarchical + 权力flat → 权力改为hierarchical');
  }

  // 矛盾 2: 单一决策者 但 权力扁平化 → 权力改为层级化
  if (conflictSingleDecider && powerFlat) {
    cm.authorityGovernance.authority = 'hierarchical';
    log.info('[phase-c] 6缝隙一致性修正: 冲突single_decider + 权力flat → 权力改为hierarchical');
  }

  // 矛盾 3: 层级信息流 + 共识决策 → 冲突解决改为多数投票
  if (infoHierarchical && conflictConsensus) {
    cm.authorityGovernance.strategy = 'majority_vote';
    log.info('[phase-c] 6缝隙一致性修正: 信息流hierarchical + 冲突consensus → 冲突改为majority_vote');
  }

  // 矛盾 4: 扁平权力 + 链式信息流 → 信息流改为全网格（扁平结构不应有链式瓶颈）
  if (powerFlat && infoChain) {
    cm.informationFlow.topology = 'full_mesh';
    log.info('[phase-c] 6缝隙一致性修正: 权力flat + 信息流chain → 信息流改为full_mesh');
  }

  // 矛盾 5: 共识决策 + 层级权力 → 权力改为合议制（共识需要平等地位）
  if (conflictConsensus && powerHierarchical) {
    cm.authorityGovernance.authority = 'collegial';
    log.info('[phase-c] 6缝隙一致性修正: 冲突consensus + 权力hierarchical → 权力改为collegial');
  }

  // 矛盾 6: 松散联邦 + 守门人外部接口 → 外部接口改为公开（联邦成员应自主对外）
  if (cm.mode === 'loose_federation' && externalGatekeeper) {
    cm.externalInterface.strategy = 'open_door';
    log.info('[phase-c] 6缝隙一致性修正: loose_federation + 外部gatekeeper → 外部改为open_door');
  }

  // 矛盾 7: 单一决策者 + 全网格信息流 → 信息流改为星型（单一决策者应有中心信息汇聚点）
  if (conflictSingleDecider && infoFullMesh) {
    cm.informationFlow.topology = 'star';
    log.info('[phase-c] 6缝隙一致性修正: 冲突single_decider + 信息流full_mesh → 信息流改为star');
  }

  // 矛盾 8: 松散联邦 + 星型信息流 → 改为全网格（松散联邦需要平等的全连通通信）
  const infoStar2 = cm.informationFlow.topology === 'star';
  if (cm.mode === 'loose_federation' && infoStar2) {
    cm.informationFlow.topology = 'full_mesh';
    log.info('[phase-c] 6缝隙一致性修正: loose_federation + 信息流star → 信息流改为full_mesh');
  }

  // 矛盾 9: 松散联邦 + 单一决策者 → 冲突解决改为多数投票（联邦成员应有平等决策权）
  if (cm.mode === 'loose_federation' && conflictSingleDecider) {
    cm.authorityGovernance.strategy = 'majority_vote';
    log.info('[phase-c] 6缝隙一致性修正: loose_federation + 冲突single_decider → 冲突改为majority_vote');
  }

  // 矛盾 10: 腾讯赛马 + 层级权力 → 权力改为扁平（赛马模式要求各小组独立平等）
  if (cm.mode === 'tencent_internal_race') {
    const powerHier = cm.authorityGovernance.authority === 'hierarchical';
    if (powerHier) {
      cm.authorityGovernance.authority = 'flat';
      log.info('[phase-c] 6缝隙一致性修正: tencent_internal_race + 权力hierarchical → 权力改为flat');
    }
  }

  // 矛盾 11: 安全/合规场景 + 松散联邦 → 安全基线审批范围自动扩展
  const taskText = [cm.safetyBaseline?.maxAutonomyLevel || '', ...(cm.safetyBaseline?.requireHumanApproval || [])].join('');
  if (cm.mode === 'loose_federation' && taskText.length > 0) {
    const approvals = cm.safetyBaseline?.requireHumanApproval || [];
    const mustHave = ['排产变更', '流程调整', '资源重分配'];
    for (const item of mustHave) {
      if (!approvals.some(a => a.includes(item))) {
        approvals.push(item);
      }
    }
    log.info('[phase-c] 6缝隙一致性修正: loose_federation 安全基线扩展审批范围');
  }

  // 矛盾 12: 民主议事 + 层级权力 → 权力改为合议制（民主决策需要扁平权力结构）
  const powerHier2 = cm.authorityGovernance.authority === 'hierarchical';
  if (cm.mode === 'democratic_council' && powerHier2) {
    cm.authorityGovernance.authority = 'collegial';
    log.info('[phase-c] 6缝隙一致性修正: democratic_council + 权力hierarchical → 权力改为collegial');
  }

  // 矛盾 13: 铁船长 + 全网格信息流 → 信息流改为星型（集中决策需要中心汇聚点）
  const infoFullMesh2 = cm.informationFlow.topology === 'full_mesh';
  if (cm.mode === 'iron_captain' && infoFullMesh2) {
    cm.informationFlow.topology = 'star';
    log.info('[phase-c] 6缝隙一致性修正: iron_captain + 信息流full_mesh → 信息流改为star');
  }

  // 矛盾 14: 交叉制衡 + 单一决策者 → 冲突解决改为多数投票（制衡需要多方裁决）
  const conflictSingleDecider2 = cm.authorityGovernance.strategy === 'single_decider';
  if (cm.mode === 'cross_check_balance' && conflictSingleDecider2) {
    cm.authorityGovernance.strategy = 'majority_vote';
    log.info('[phase-c] 6缝隙一致性修正: cross_check_balance + 冲突single_decider → 冲突改为majority_vote');
  }
}