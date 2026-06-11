/**
 * engine-server/pipeline/cross-persona-checker.ts — 跨角色兼容性检测器
 *
 * 在 Phase C 协作模式选择时，检测角色间 OCEAN 配置和认知框架的潜在冲突。
 * 结果用于：① 影响模式评分（有冲突时扣分） ② 注入 LLM 提示词（提示冲突点以调整缝隙参数）
 *
 * 规则来源：CROSS-PERSONA-RULES 24 条 → 抽取适用于引擎 Pipeline 的 10 条核心规则。
 * 设计原则：纯规则驱动（不调 LLM），直接消费 Phase A TeamStructure + Phase B PersonaGenomeBlue。
 */

import type { TeamStructureBlue, PersonaGenomeBlue, CollaborationMode } from '../types';
import { createLogger } from '../infra/logger';

const log = createLogger('pipeline/cross-persona-checker');

// ================================================================
// 类型
// ================================================================

export interface PersonaConflict {
  /** 冲突 ID */
  id: string;
  /** 涉及的缝隙维度 */
  gaps: string[];
  /** 严重级别 */
  severity: 'critical' | 'warning' | 'info';
  /** 涉及的角色名 */
  roles: string[];
  /** 冲突描述 */
  description: string;
  /** 建议缓解措施 */
  recommendation: string;
}

export interface CrossPersonaReport {
  conflicts: PersonaConflict[];
  /** 内洽评分 0-100 */
  overallScore: number;
  /** 哪些协作模式受影响最大 */
  affectedModes: Array<{ mode: CollaborationMode; penalty: number; conflicts: string[] }>;
}

// ================================================================
// 信号提取
// ================================================================

interface RoleProfile {
  roleId: string;
  roleName: string;
  governanceLayer: string;
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
  responsibilities: string[];
  /** 认知模型数量 */
  mentalModelCount: number;
  /** 是否有审计/合规相关职责 */
  hasComplianceDuty: boolean;
  /** 是否有创新/探索相关职责 */
  hasInnovationDuty: boolean;
  /** 是否有速度/效率相关职责 */
  hasSpeedDuty: boolean;
}

function buildProfiles(
  team: TeamStructureBlue,
  genomes: PersonaGenomeBlue[],
): RoleProfile[] {
  return team.roles.map((role) => {
    const genome = genomes.find((g) => g.roleId === role.id);
    const ocean = genome?.oceanScores || { openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, neuroticism: 0.5 };
    const respText = role.responsibilities.join(' ');

    return {
      roleId: role.id,
      roleName: role.name,
      governanceLayer: role.governanceLayer,
      openness: ocean.openness,
      conscientiousness: ocean.conscientiousness,
      extraversion: ocean.extraversion,
      agreeableness: ocean.agreeableness,
      neuroticism: ocean.neuroticism,
      responsibilities: role.responsibilities,
      mentalModelCount: genome?.mentalModels?.length || 0,
      hasComplianceDuty: /合规|审计|安全|审查|风险评估|法规/i.test(respText),
      hasInnovationDuty: /创新|探索|研发|设计|创意|突破/i.test(respText),
      hasSpeedDuty: /快速|效率|迭代|交付|执行/i.test(respText),
    };
  });
}

// ================================================================
// 10 条引擎内跨角色规则
// ================================================================

type CheckRule = (
  profiles: RoleProfile[],
  mode: CollaborationMode,
) => PersonaConflict | null;

// R01: 高开放 vs 低开放 — 信息流偏好冲突
function r01_opennessClash(profiles: RoleProfile[]): PersonaConflict | null {
  const high = profiles.filter((p) => p.openness >= 0.7);
  const low = profiles.filter((p) => p.openness <= 0.3);
  if (high.length > 0 && low.length > 0) {
    return {
      id: 'CP-R01',
      gaps: ['information_flow', 'knowledge_sharing'],
      severity: 'warning',
      roles: [...high.map((p) => p.roleName), ...low.map((p) => p.roleName)],
      description: `${high.map((p) => p.roleName).join('、')} 高度开放(≥0.7)，偏好信息自由流动；${low.map((p) => p.roleName).join('、')} 低开放性(≤0.3)，偏好稳定可预测——信息流风格冲突。`,
      recommendation: '信息流拓扑建议用 star（低开角色为中心节点）或分层（高开角色 full_mesh，低开角色按需推送）。',
    };
  }
  return null;
}

// R02: 高尽责 vs 低尽责 — 分工模式冲突
function r02_conscientiousnessClash(profiles: RoleProfile[]): PersonaConflict | null {
  const high = profiles.filter((p) => p.conscientiousness >= 0.75);
  const low = profiles.filter((p) => p.conscientiousness <= 0.35);
  if (high.length > 0 && low.length > 0) {
    return {
      id: 'CP-R02',
      gaps: ['division_of_labor', 'trust_incentive'],
      severity: 'warning',
      roles: [...high.map((p) => p.roleName), ...low.map((p) => p.roleName)],
      description: `${high.map((p) => p.roleName).join('、')} 高尽责性(≥0.75)，重视规范和细节；${low.map((p) => p.roleName).join('、')} 低尽责性(≤0.35)，偏好灵活应变——分工模式可能产生摩擦。`,
      recommendation: '低尽责角色赋予 flexible 分工模式（可替换），高尽责角色赋予 fixed 模式（规范化）；初始信任建议 medium。',
    };
  }
  return null;
}

// R03: 高外倾 vs 低外倾 — 沟通与同步冲突
function r03_extraversionClash(profiles: RoleProfile[]): PersonaConflict | null {
  const high = profiles.filter((p) => p.extraversion >= 0.7);
  const low = profiles.filter((p) => p.extraversion <= 0.3);
  if (high.length > 0 && low.length > 0) {
    return {
      id: 'CP-R03',
      gaps: ['information_flow', 'authority_governance'],
      severity: 'info',
      roles: [...high.map((p) => p.roleName), ...low.map((p) => p.roleName)],
      description: `${high.map((p) => p.roleName).join('、')} 高外倾(≥0.7)，偏好主动沟通快速表达；${low.map((p) => p.roleName).join('、')} 低外倾(≤0.3)，偏好深度专注异步沟通——沟通节奏不一致。`,
      recommendation: '同步模式建议 round_robin（轮流发言），避免 free_form（高外倾抢占话语权）。',
    };
  }
  return null;
}

// R04: 高宜人 vs 低宜人 — 冲突解决风格冲突
function r04_agreeablenessClash(profiles: RoleProfile[]): PersonaConflict | null {
  const high = profiles.filter((p) => p.agreeableness >= 0.7);
  const low = profiles.filter((p) => p.agreeableness <= 0.3);
  if (high.length > 0 && low.length > 0) {
    return {
      id: 'CP-R04',
      gaps: ['authority_governance', 'authority_governance'],
      severity: 'warning',
      roles: [...high.map((p) => p.roleName), ...low.map((p) => p.roleName)],
      description: `${high.map((p) => p.roleName).join('、')} 高宜人性(≥0.7)，倾向和谐回避冲突；${low.map((p) => p.roleName).join('、')} 低宜人性(≤0.3)，直言不讳不回避——冲突处理方式差异可能产生张力。`,
      recommendation: '冲突解决建议设 escalation 路径（低宜人角色可成为仲裁者），死锁超时建议 ≤300s。',
    };
  }
  return null;
}

// R05: 高神经质 vs 低神经质 — 风险感知差异
function r05_neuroticismClash(profiles: RoleProfile[]): PersonaConflict | null {
  const high = profiles.filter((p) => p.neuroticism >= 0.7);
  const low = profiles.filter((p) => p.neuroticism <= 0.3);
  if (high.length > 0 && low.length > 0) {
    return {
      id: 'CP-R05',
      gaps: ['trust_incentive', 'safety_baseline'],
      severity: 'warning',
      roles: [...high.map((p) => p.roleName), ...low.map((p) => p.roleName)],
      description: `${high.map((p) => p.roleName).join('、')} 高神经质(≥0.7)，对风险高度敏感；${low.map((p) => p.roleName).join('、')} 低神经质(≤0.3)，情绪稳定抗干扰——风险感知不匹配可能让高神经质角色感到不被重视。`,
      recommendation: '信任模型建议加 degradationTriggers（高神经质角色关注的风险触发点），审计日志必须开启。',
    };
  }
  return null;
}

// R06: L3 治理 vs L2 执行 — 权力分布冲突
function r06_governanceLayerClash(profiles: RoleProfile[], mode: CollaborationMode): PersonaConflict | null {
  const l3Roles = profiles.filter((p) => p.governanceLayer === 'L3_governance');
  const l2Roles = profiles.filter((p) => p.governanceLayer === 'L2_execution');
  if (l3Roles.length > 0 && l2Roles.length >= 3 && mode === 'iron_captain') {
    return {
      id: 'CP-R06',
      gaps: ['authority_governance', 'authority_governance'],
      severity: 'warning',
      roles: [...l3Roles.map((p) => p.roleName), ...l2Roles.slice(0, 2).map((p) => p.roleName)],
      description: `${l3Roles.length} 个 L3 治理层角色 + ${l2Roles.length} 个 L2 执行层角色在 iron_captain 模式下——单人决策可能让 L3 角色之间产生决策权冲突，L2 角色可能越级汇报。`,
      recommendation: '如果保留 iron_captain，需明确单一 Captain 是谁，其他 L3 角色降为顾问。或者切换到 cross_check_balance 或 democratic_council。',
    };
  }
  return null;
}

// R07: 合规角色 + 创新角色 — 速度 vs 安全冲突
function r07_complianceVsInnovation(profiles: RoleProfile[]): PersonaConflict | null {
  const compliance = profiles.filter((p) => p.hasComplianceDuty);
  const innovation = profiles.filter((p) => p.hasInnovationDuty);
  if (compliance.length > 0 && innovation.length > 0) {
    return {
      id: 'CP-R07',
      gaps: ['external_interface', 'safety_baseline'],
      severity: 'info',
      roles: [...compliance.map((p) => p.roleName), ...innovation.map((p) => p.roleName)],
      description: `${compliance.map((p) => p.roleName).join('、')} 关注合规安全，${innovation.map((p) => p.roleName).join('、')} 关注创新探索——这是健康的张力，但需要明确的边界。`,
      recommendation: '外部接口策略建议 gatekeeper（合规角色审批）+ ambassador（创新角色探索外部），沙箱级别至少 semi。',
    };
  }
  return null;
}

// R08: 速度角色 + 质量角色 — 节奏冲突
function r08_speedVsQuality(profiles: RoleProfile[]): PersonaConflict | null {
  const speed = profiles.filter((p) => p.hasSpeedDuty);
  const quality = profiles.filter((p) => p.conscientiousness >= 0.65);
  if (speed.length > 0 && quality.length > 0 && profiles.some((p) => p.hasSpeedDuty && p.conscientiousness >= 0.65)) {
    return null; // 同一个人兼速度和质量，不冲突
  }
  if (speed.length > 0 && quality.length > 0) {
    return {
      id: 'CP-R08',
      gaps: ['division_of_labor', 'trust_incentive'],
      severity: 'info',
      roles: [...speed.map((p) => p.roleName), ...quality.map((p) => p.roleName)],
      description: `${speed.map((p) => p.roleName).join('、')} 关注速度效率，${quality.map((p) => p.roleName).join('、')} 高尽责关注质量——节奏差异可能产生交付冲突。`,
      recommendation: '激励对齐建议 mixed（速度角色的成功信号=交付速度，质量角色的成功信号=质量指标），分工建议 flexible 以允许节奏调整。',
    };
  }
  return null;
}

// R09: 认知模型数量差异 — 决策复杂度不匹配
function r09_mentalModelGap(profiles: RoleProfile[]): PersonaConflict | null {
  const counts = profiles.map((p) => p.mentalModelCount);
  const max = Math.max(...counts);
  const min = Math.min(...counts);
  if (max - min >= 3 && min === 0) {
    const rich = profiles.filter((p) => p.mentalModelCount === max);
    const poor = profiles.filter((p) => p.mentalModelCount === min);
    return {
      id: 'CP-R09',
      gaps: ['knowledge_sharing', 'trust_incentive'],
      severity: 'info',
      roles: [...rich.map((p) => p.roleName), ...poor.map((p) => p.roleName)],
      description: `${rich.map((p) => p.roleName).join('、')} 有 ${max} 个认知框架，${poor.map((p) => p.roleName).join('、')} 无认知框架——决策推理深度不匹配。`,
      recommendation: '知识共享间隔建议缩短（≤12h），初始信任建议 medium（需要时间校准认知差距）。',
    };
  }
  return null;
}

// R10: 全 L3 无 L1/L2 — 治理过度集中
function r10_allGovernanceNoExecution(profiles: RoleProfile[], mode: CollaborationMode): PersonaConflict | null {
  const l3 = profiles.filter((p) => p.governanceLayer === 'L3_governance');
  const l1 = profiles.filter((p) => p.governanceLayer === 'L1_understanding');
  const l2 = profiles.filter((p) => p.governanceLayer === 'L2_execution');
  if (l3.length >= 2 && l1.length === 0 && l2.length === 0) {
    return {
      id: 'CP-R10',
      gaps: ['division_of_labor', 'authority_governance'],
      severity: 'critical',
      roles: l3.map((p) => p.roleName),
      description: `全部 ${l3.length} 个角色都在 L3 治理层，缺少 L1 理解层和 L2 执行层——"所有人决策，没人干活"。`,
      recommendation: '至少需要一个 L2 执行层角色来承接决策。分工模式应设为 fixed（不可替代），权力分布设 hierarchical（明确一级决策者）。',
    };
  }
  return null;
}

// ================================================================
// 主检测函数
// ================================================================

const ALL_RULES: Array<{
  id: string;
  check: CheckRule;
  /** 当此规则触发时，哪些协作模式应被扣分 */
  modePenalties: Partial<Record<CollaborationMode, number>>;
}> = [
  { id: 'R01', check: (p) => r01_opennessClash(p), modePenalties: { loose_federation: 2, democratic_council: 1 } },
  { id: 'R02', check: (p) => r02_conscientiousnessClash(p), modePenalties: { loose_federation: 3, bytedance_flat: 1 } },
  { id: 'R03', check: (p) => r03_extraversionClash(p), modePenalties: { iron_captain: 1 } },
  { id: 'R04', check: (p) => r04_agreeablenessClash(p), modePenalties: { iron_captain: 2, democratic_council: 1 } },
  { id: 'R05', check: (p) => r05_neuroticismClash(p), modePenalties: { loose_federation: 2 } },
  { id: 'R06', check: (p, m) => r06_governanceLayerClash(p, m), modePenalties: { iron_captain: 3 } },
  { id: 'R07', check: (p) => r07_complianceVsInnovation(p), modePenalties: { tencent_internal_race: 2 } },
  { id: 'R08', check: (p) => r08_speedVsQuality(p), modePenalties: { iron_captain: 1, tencent_internal_race: 1 } },
  { id: 'R09', check: (p) => r09_mentalModelGap(p), modePenalties: { iron_captain: 1, mckinsey_partnership: 2 } },
  { id: 'R10', check: (p, m) => r10_allGovernanceNoExecution(p, m), modePenalties: {} },
];

/**
 * 对给定的团队和协作模式执行跨角色冲突检测
 */
export function checkCrossPersonaCoherence(
  team: TeamStructureBlue,
  genomes: PersonaGenomeBlue[],
  mode: CollaborationMode,
): CrossPersonaReport {
  const profiles = buildProfiles(team, genomes);
  const conflicts: PersonaConflict[] = [];
  const modePenalties = new Map<CollaborationMode, { penalty: number; conflicts: string[] }>();

  for (const rule of ALL_RULES) {
    try {
      const conflict = rule.check(profiles, mode);
      if (conflict) {
        conflicts.push(conflict);

        // 记录各模式受此冲突影响的扣分
        for (const [m, penalty] of Object.entries(rule.modePenalties)) {
          const entry = modePenalties.get(m as CollaborationMode) || { penalty: 0, conflicts: [] };
          entry.penalty += penalty;
          entry.conflicts.push(conflict.id);
          modePenalties.set(m as CollaborationMode, entry);
        }
      }
    } catch (_e) { log.debug('跨角色规则检查异常: %s', String(_e)); }
  }

  // 计算评分
  let score = 100;
  for (const c of conflicts) {
    switch (c.severity) {
      case 'critical': score -= 15; break;
      case 'warning': score -= 5; break;
      case 'info': score -= 1; break;
    }
  }

  const affectedModes = Array.from(modePenalties.entries())
    .map(([mode, { penalty, conflicts: cids }]) => ({ mode, penalty, conflicts: cids }))
    .sort((a, b) => b.penalty - a.penalty);

  return { conflicts, overallScore: Math.max(0, score), affectedModes };
}

/**
 * 生成冲突摘要（注入 LLM 提示词）
 */
export function formatConflictsForLLM(report: CrossPersonaReport): string {
  if (report.conflicts.length === 0) {
    return '未检测到角色间兼容性冲突。';
  }

  const lines: string[] = [
    `检测到 ${report.conflicts.length} 个跨角色兼容性问题（内洽评分 ${report.overallScore}/100）：`,
    '',
  ];
  for (const c of report.conflicts) {
    const sev = c.severity === 'critical' ? '严重' : c.severity === 'warning' ? '警告' : '提示';
    lines.push(`[${sev}] ${c.id}: ${c.description}`);
    lines.push(`  缓解措施：${c.recommendation}`);
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * 获取跨角色冲突对各模式的扣分（供 Phase C 评分用）
 */
export function getCrossPersonaPenalties(
  team: TeamStructureBlue,
  genomes: PersonaGenomeBlue[],
): Map<CollaborationMode, number> {
  const dummyMode: CollaborationMode = 'iron_captain';
  // 以任意模式运行检测（大部分规则不依赖 mode，少数依赖的需要遍历）
  const allModes: CollaborationMode[] = [
    'iron_captain', 'democratic_council', 'loose_federation',
    'cross_check_balance', 'bytedance_flat', 'haier_ren_dan_he_yi',
    'haidilao_frontline_auth', 'mckinsey_partnership', 'tencent_internal_race',
  ];

  const penalties = new Map<CollaborationMode, number>();
  for (const mode of allModes) {
    const report = checkCrossPersonaCoherence(team, genomes, mode);
    let total = 0;
    for (const c of report.conflicts) {
      switch (c.severity) {
        case 'critical': total += 4; break;
        case 'warning': total += 2; break;
        case 'info': total += 1; break;
      }
    }
    penalties.set(mode, total);
  }

  return penalties;
}
