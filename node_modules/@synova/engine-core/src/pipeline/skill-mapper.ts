/**
 * skill-mapper.ts — L4 技能映射引擎
 *
 * 框架→技能映射，遵循"engine determines WHAT, LLM fills details"模式。
 * 引擎从匹配框架的 skillPatterns 中提取技能核心（name/summary/tags/category），
 * LLM 负责填充 scenarios/steps/description 细节。
 */

import * as fs from 'fs';
import * as path from 'path';
import { matchFrameworksByConstraint } from './phase-b/framework-matcher';
import { computeBlendedScore } from './phase-b/framework-feedback';
import { SEED_FRAMEWORKS } from './phase-b/framework-library';
import type { Framework, SkillPattern } from './phase-b/framework-library';
import type { RoleBlue, SkillCard } from '../types';
import { ALL_SEED_SKILLS } from './skill-seeds';
import { loadRegistryFromDisk } from './skill-registry-writer';
import { getEngineContext } from '../engine-context';
import { createLogger } from '../infra/logger';

const log = createLogger('engine-server/pipeline/skill-mapper');

// ══════════════════════════════════════════════════════════════════
// 市场技能注册表（预索引内存 Map，O(1) 查找）
// ══════════════════════════════════════════════════════════════════

export interface MarketplaceSkillEntry extends SkillPattern {
  version: string;
  securityScore: number;
  license?: string;
  allowedTools: string[];
  source: 'cloud' | 'local_seed' | 'agent_generated';
}

/** 市场技能内存注册表 — 引擎启动时从种子数据构建 */
const MARKETPLACE_REGISTRY: Map<string, MarketplaceSkillEntry> = new Map();

/** 已知恶意技能 blocklist（skillName → blockReason） */
const SKILL_BLOCKLIST: Map<string, string> = new Map();

let registryInitialized = false;

/** 初始化市场注册表（引擎启动时调用一次） */
export function initMarketplaceRegistry(extraEntries?: MarketplaceSkillEntry[]): void {
  if (registryInitialized) return;

  // 从种子数据加载
  for (const seed of ALL_SEED_SKILLS) {
    MARKETPLACE_REGISTRY.set(seed.name, {
      ...seed,
      version: '1.0.0',
      securityScore: 85, // 种子数据默认安全
      license: 'Apache-2.0',
      allowedTools: inferToolsFromTags(seed.tags),
      source: 'local_seed',
    });
  }

  // 加载外部条目（云端拉取的技能）
  if (extraEntries) {
    for (const entry of extraEntries) {
      MARKETPLACE_REGISTRY.set(entry.name, entry);
    }
  }

  // 从磁盘加载之前引擎生成的技能（飞轮回写）
  try {
    const diskEntries = loadRegistryFromDisk();
    for (const entry of diskEntries) {
      // 不覆盖已有种子技能（种子优先）
      if (MARKETPLACE_REGISTRY.has(entry.name)) continue;
      MARKETPLACE_REGISTRY.set(entry.name, {
        name: entry.name,
        summary: entry.summary,
        category: entry.category,
        tags: entry.tags,
        version: entry.version,
        securityScore: entry.securityScore ?? 85,
        license: entry.sourceTier === 'speculative' ? undefined : 'Apache-2.0',
        allowedTools: [],
        source: 'local_seed',
        sourceTier: entry.sourceTier as 'verified' | 'inferred' | 'speculative',
        isMarketplaceSkill: entry.securityScore != null && entry.securityScore >= 70,
        prerequisites: entry.prerequisites || [],
        failureModes: entry.failureModes || [],
        dependsOn: [],
        conflictsWith: [],
        triggers: [],
      });
    }
    if (diskEntries.length > 0) {
      log.info(`[skill-mapper] 从磁盘加载 ${diskEntries.length} 已生成技能`);
    }
  } catch (_e) { log.debug('磁盘技能加载失败: %s', String(_e)); }

  // 加载 blocklist
  try {
    const blocklistPath = getEngineContext().filePaths.skillBlocklistPath || path.resolve(__dirname, '../../marketplace/skill-blocklist.json');
    if (fs.existsSync(blocklistPath)) {
      const raw = fs.readFileSync(blocklistPath, 'utf-8');
      const blocklist = JSON.parse(raw);
      for (const entry of (blocklist.entries || [])) {
        SKILL_BLOCKLIST.set(entry.name, entry.reason);
      }
    }
  } catch (_e) { log.debug('技能黑名单加载失败: %s', String(_e)); }

  registryInitialized = true;
  log.info(`[skill-mapper] 市场注册表初始化: ${MARKETPLACE_REGISTRY.size} 技能, ${SKILL_BLOCKLIST.size} 黑名单`);
}

/** 从 tags 推断允许的工具 */
function inferToolsFromTags(tags: string[]): string[] {
  const tagToolMap: Record<string, string[]> = {
    '网页抓取': ['web_fetch', 'web_search'],
    '数据分析': ['file_read', 'code_execution'],
    '代码': ['file_read', 'file_write', 'code_execution'],
    '翻译': ['text_process'],
    '合规': ['file_read', 'web_search'],
    '出口': ['file_read', 'web_search'],
    '客服': ['text_process'],
    '邮件': ['text_process'],
    '社交媒体': ['text_process', 'web_search'],
    '可视化': ['file_read', 'code_execution'],
    '隐私': ['file_read', 'text_process'],
  };

  const tools = new Set<string>();
  for (const tag of tags) {
    const mapped = tagToolMap[tag];
    if (mapped) mapped.forEach(t => tools.add(t));
  }
  return tools.size > 0 ? [...tools] : ['file_read'];
}

// ══════════════════════════════════════════════════════════════════
// 市场技能查找（含 4 道安全闸门）
// ══════════════════════════════════════════════════════════════════

export interface SkillResolveResult {
  found: boolean;
  entry?: MarketplaceSkillEntry;
  reason?: string;
  /** 如果市场不可用，返回的引擎生成核心 */
  fallbackCore?: MappedSkillCore;
}

/**
 * 在市场注册表中查找技能，通过 4 道安全闸门。
 *
 * Gate 1: 安全评分 >= 70
 * Gate 2: 不在 blocklist 中
 * Gate 3: sourceTier 可信度（speculative 拒绝）
 * Gate 4: 能力边界 — allowedTools 在 Agent 允许范围内
 */
export function resolveSkill(
  skillName: string,
  agentDenyTools: string[] = [],
): SkillResolveResult {
  if (!registryInitialized) {
    initMarketplaceRegistry();
  }

  const entry = MARKETPLACE_REGISTRY.get(skillName);
  if (!entry) {
    return { found: false, reason: 'not_in_marketplace' };
  }

  // Gate 1: 安全评分
  if (entry.securityScore < 70) {
    return { found: false, reason: `security_score_low(${entry.securityScore})`, entry };
  }

  // Gate 2: blocklist
  const blockReason = SKILL_BLOCKLIST.get(entry.name);
  if (blockReason) {
    return { found: false, reason: `blocklisted: ${blockReason}`, entry };
  }

  // Gate 3: 来源可信度
  if (entry.sourceTier === 'speculative') {
    return { found: false, reason: 'speculative_source', entry };
  }

  // Gate 4: 能力边界
  if (agentDenyTools.length > 0 && entry.allowedTools.length > 0) {
    const deniedTools = entry.allowedTools.filter(t => agentDenyTools.includes(t));
    if (deniedTools.length > 0) {
      return { found: false, reason: `tool_conflict(${deniedTools.join(',')})`, entry };
    }
  }

  return { found: true, entry };
}

/** 批量查找：返回所有命中的市场技能 + 未命中的技能名列表 */
export function resolveSkillsBatch(
  skillNames: string[],
  agentDenyTools: string[] = [],
): { hits: Map<string, MarketplaceSkillEntry>; misses: string[] } {
  const hits = new Map<string, MarketplaceSkillEntry>();
  const misses: string[] = [];

  for (const name of skillNames) {
    const result = resolveSkill(name, agentDenyTools);
    if (result.found && result.entry) {
      hits.set(name, result.entry);
    } else {
      misses.push(name);
    }
  }

  return { hits, misses };
}

// ══════════════════════════════════════════════════════════════════
// 云端市场查找（Path 1：本地未命中 → 云端兜底）
// ══════════════════════════════════════════════════════════════════

/** 将云端技能摘要转为本地注册表条目 */
function cloudToEntry(skill: { name: string; summary: string; category: string; tags: string[]; version?: string; securityScore?: number | null }): MarketplaceSkillEntry {
  return {
    name: skill.name,
    summary: skill.summary,
    category: skill.category || 'general',
    tags: skill.tags || [],
    version: skill.version || '1.0.0',
    securityScore: skill.securityScore != null ? skill.securityScore : 75,
    license: 'Apache-2.0',
    allowedTools: inferToolsFromTags(skill.tags || []),
    source: 'cloud',
    sourceTier: 'verified' as const,
    isMarketplaceSkill: true,
    prerequisites: [],
    failureModes: [],
    dependsOn: [],
    conflictsWith: [],
    triggers: [],
  };
}

/**
 * 云端查找技能 — 本地注册表未命中时调用。
 * 成功查到的技能自动缓存到本地注册表（下次 O(1) 命中）。
 */
export async function fetchSkillsFromCloud(skillNames: string[]): Promise<Map<string, MarketplaceSkillEntry>> {
  const results = new Map<string, MarketplaceSkillEntry>();

  if (skillNames.length === 0) return results;

  try {
    // 逐个搜索（云端暂不支持批量 skill name 查询）
    const searches = skillNames.map(async (name) => {
      try {
        const resp = await getEngineContext().marketplace.search(name, 'skill');
        if (!resp?.skills?.length) return null;
        // 精确匹配优先，模糊匹配兜底
        const match = resp.skills.find((s: any) => s.name === name)
          || resp.skills[0];
        return { name, match };
      } catch {
        log.debug(`[skill-mapper] cloud search failed for skill: ${name}`);
        return null;
      }
    });

    const settled = await Promise.all(searches);

    for (const item of settled) {
      if (!item?.match) continue;
      const entry = cloudToEntry(item.match);
      // 缓存到本地注册表
      if (!MARKETPLACE_REGISTRY.has(entry.name)) {
        MARKETPLACE_REGISTRY.set(entry.name, entry);
      }
      results.set(item.name, entry);
    }

    if (results.size > 0) {
      log.info(`[skill-mapper] 云端命中 ${results.size}/${skillNames.length} 技能`);
    }
  } catch (err) {
    // 云端不可用不阻塞管线
    log.info(`[skill-mapper] 云端查找降级: ${(err as Error).message}`);
  }

  return results;
}

/**
 * 云端技能富化 — 对 mapSkillsForTeam 产出的引擎回退技能做云端兜底。
 * 将本地未命中的 inferred 技能升级为 verified marketplace 技能。
 */
export async function enrichCoresWithCloud(
  mapping: Map<string, MappedSkillCore[]>,
  abortSignal?: AbortSignal,
): Promise<Map<string, MappedSkillCore[]>> {
  // 收集所有引擎回退的技能名（isMarketplaceSkill = false）
  const fallbackNames: string[] = [];
  const fallbackLocations: Array<{ roleId: string; index: number }> = [];

  for (const [roleId, cores] of mapping) {
    for (let i = 0; i < cores.length; i++) {
      if (!cores[i].isMarketplaceSkill) {
        fallbackNames.push(cores[i].name);
        fallbackLocations.push({ roleId, index: i });
      }
    }
  }

  if (fallbackNames.length === 0) return mapping;

  // 去重后查询云端
  const unique = [...new Set(fallbackNames)];
  if (abortSignal?.aborted) return mapping;

  const cloudHits = await fetchSkillsFromCloud(unique);

  if (cloudHits.size === 0) return mapping;

  // 升级命中的技能核心
  for (const { roleId, index } of fallbackLocations) {
    const core = mapping.get(roleId)?.[index];
    if (!core) continue;
    const entry = cloudHits.get(core.name);
    if (entry) {
      core.summary = entry.summary;
      core.category = entry.category;
      core.tags = entry.tags;
      core.sourceFrameworkId = 'marketplace';
      core.matchConfidence = 0.90;
      core.isMarketplaceSkill = true;
      core.prerequisites = entry.prerequisites || [];
      core.sourceTier = 'verified';
    }
  }

  return mapping;
}

export interface MappedSkillCore {
  name: string;
  summary: string;
  category: string;
  tags: string[];
  sourceFrameworkId: string;
  matchConfidence: number;
  isMarketplaceSkill: boolean;
  /** V1.5 L2: 使用前需具备的信息或前置技能 */
  prerequisites: string[];
  /** V1.5 L2: 信源层级 */
  sourceTier: 'verified' | 'inferred' | 'speculative';
}

export interface SkillMappingResult {
  engineMapped: MappedSkillCore[];
  skillGaps: string[];
  coverage: number;
}

/**
 * 计算技能与角色的相关性分数（0-1）。
 * 基于角色名、职责、技能需求与技能名/摘要/tags 的关键词重叠。
 */
function skillRoleRelevance(sp: { name: string; summary: string; tags: string[] }, role: RoleBlue): number {
  const roleText = `${role.name} ${role.responsibilities.join(' ')} ${role.skillsRequired.join(' ')}`.toLowerCase();
  const skillText = `${sp.name} ${sp.summary} ${sp.tags.join(' ')}`.toLowerCase();

  // 提取角色关键词（2字以上的中文词，或3字以上的英文词）
  const roleWords = new Set(
    roleText.split(/[\s,，、。/；;：:]+/).filter(w => w.length >= 2)
  );

  let hits = 0;
  let total = 0;
  for (const w of roleWords) {
    total++;
    if (skillText.includes(w)) hits++;
  }

  // 如果角色关键词太少，使用字符级匹配
  if (total < 3) {
    const roleChars = new Set(roleText.replace(/\s/g, ''));
    let charHits = 0;
    for (const ch of roleChars) {
      if (skillText.includes(ch)) charHits++;
    }
    return charHits / Math.max(roleChars.size, 1);
  }

  return hits / Math.max(total, 1);
}

/**
 * 从 role.skillsRequired 生成技能核心（主来源 — 角色专属）。
 * Phase A 已为每个角色推导了技能需求，直接转为技能核心，
 * 确保每个角色有差异化技能。
 */
function buildSkillsFromRequired(role: RoleBlue): MappedSkillCore[] {
  const categoryMap: Record<string, string> = {
    L1_understanding: '理解与分析',
    L2_execution: '执行与交付',
    L3_governance: '治理与决策',
  };
  const defaultCategory = categoryMap[role.governanceLayer] || '通用技能';

  return (role.skillsRequired || []).map((skillName) => {
    // 市场优先：检查市场注册表
    const marketResult = resolveSkill(skillName);
    if (marketResult.found && marketResult.entry) {
      return {
        name: marketResult.entry.name,
        summary: marketResult.entry.summary,
        category: marketResult.entry.category,
        tags: marketResult.entry.tags,
        sourceFrameworkId: 'marketplace',
        matchConfidence: 0.95, // 市场技能置信度更高
        isMarketplaceSkill: true,
        prerequisites: marketResult.entry.prerequisites || [],
        sourceTier: 'verified' as const,
      };
    }

    // 引擎生成（降级）
    return {
      name: skillName,
      summary: `${role.name}的${skillName}能力`,
      category: defaultCategory,
      tags: [role.name, ...role.responsibilities.slice(0, 2)],
      sourceFrameworkId: 'phase-a-derived',
      matchConfidence: 0.85,
      isMarketplaceSkill: false,
      prerequisites: [],
      sourceTier: 'inferred' as const,
    };
  });
}

/** 为单个角色映射技能核心（skillsRequired 主来源 + 框架 skillPatterns 补充） */
export function mapSkillsForRole(role: RoleBlue, constraints: string[]): MappedSkillCore[] {
  const seen = new Set<string>();
  const results: MappedSkillCore[] = [];

  // ── 主来源：Phase A 推导的角色技能需求（保证差异化）──
  for (const core of buildSkillsFromRequired(role)) {
    seen.add(core.name);
    results.push(core);
  }

  // ── 补充来源：框架 skillPatterns（按角色相关性过滤，去重）──
  const matchedFrameworks = new Map<string, { framework: Framework; score: number }>();
  for (const constraint of constraints) {
    const matches = matchFrameworksByConstraint(constraint, SEED_FRAMEWORKS);
    for (const m of matches) {
      if (!m.framework.skillPatterns || m.framework.skillPatterns.length === 0) continue;
      const existing = matchedFrameworks.get(m.framework.id);
      if (!existing || existing.score < m.matchScore) {
        matchedFrameworks.set(m.framework.id, { framework: m.framework, score: m.matchScore });
      }
    }
  }

  const sortedFrameworks = [...matchedFrameworks.values()].sort((a, b) => b.score - a.score).slice(0, 8);

  // 收集框架技能，去重并评分
  const candidates: Array<{ sp: SkillPattern; framework: Framework; score: number; relevance: number }> = [];
  const frameworkSeen = new Set(seen); // 不与 skillsRequired 技能重复
  for (const { framework, score } of sortedFrameworks) {
    for (const sp of (framework.skillPatterns || [])) {
      if (frameworkSeen.has(sp.name)) continue;
      frameworkSeen.add(sp.name);
      candidates.push({ sp, framework, score, relevance: skillRoleRelevance(sp, role) });
    }
  }

  candidates.sort((a, b) => {
    const aScore = computeBlendedScore(a.score, a.relevance, a.sp.name, a.framework.id);
    const bScore = computeBlendedScore(b.score, b.relevance, b.sp.name, b.framework.id);
    return bScore - aScore;
  });

  // 补充最多 4 个框架技能（避免喧宾夺主）
  const supplementN = Math.min(4, candidates.length);
  for (let i = 0; i < supplementN; i++) {
    const c = candidates[i];
    if (c.relevance < 0.15) continue; // 相关性太低的跳过
    results.push({
      name: c.sp.name,
      summary: c.sp.summary,
      category: c.sp.category,
      tags: c.sp.tags,
      sourceFrameworkId: c.framework.id,
      matchConfidence: c.score,
      isMarketplaceSkill: c.sp.isMarketplaceSkill,
      prerequisites: c.sp.prerequisites || [],
      sourceTier: c.sp.sourceTier || 'inferred',
    });
  }

  return results;
}

/** 批量映射所有角色，目标每角色至少 2 个技能 */
export function mapSkillsForTeam(
  roles: RoleBlue[],
  constraints: string[],
): { mapping: Map<string, MappedSkillCore[]>; gaps: string[] } {
  const mapping = new Map<string, MappedSkillCore[]>();
  const gaps: string[] = [];

  for (const role of roles) {
    const cores = mapSkillsForRole(role, constraints);
    mapping.set(role.id, cores);
    if (cores.length < 2) {
      gaps.push(`${role.name}（仅${cores.length}个引擎技能，需LLM补全）`);
    }
  }

  return { mapping, gaps };
}

/** 构建 LLM prompt 中引擎已映射技能的部分 */
export function buildSkillPromptSections(
  mapping: Map<string, MappedSkillCore[]>,
): string {
  const sections: string[] = [];

  for (const [roleId, cores] of mapping) {
    if (cores.length === 0) continue;
    const lines = cores.map(c =>
      `  - ${c.name}（${c.summary}）[分类: ${c.category}, 标签: ${c.tags.join('/')}]`
    );
    sections.push(`角色 ${roleId}:\n${lines.join('\n')}`);
  }

  if (sections.length === 0) return '';
  return [
    '【引擎已预选以下技能核心 — 请为每个补充 scenarios（2-4个使用场景）和 steps（2-4个执行步骤）】',
    ...sections,
    '【注意】引擎已选定技能的 name/summary/category/tags 不可变，仅补充场景和步骤。',
  ].join('\n\n');
}

/** 降级路径：纯引擎映射生成 SkillCard（LLM 不可用时使用） */
export function buildSkillCardsFromCores(cores: MappedSkillCore[], roleId: string): SkillCard[] {
  return cores.map((c, i) => ({
    id: `${roleId}-skill-${i + 1}`,
    name: c.name,
    summary: c.summary,
    description: c.summary,
    // 默认 scenarios/steps 保证可执行性审计通过（LLM 路径会覆盖为真实值）
    scenarios: [
      `当需要${c.name}相关操作时使用`,
      `作为${c.category || '通用'}类技能在团队协作中调用`,
    ],
    steps: [
      `明确${c.name}的具体需求`,
      `执行${c.name}核心流程`,
      `验证${c.name}的结果是否符合预期`,
    ],
    tags: c.tags,
    category: c.category,
    version: '0.0.0-engine',
    securityScore: null,
    installCommand: `claworg skill install ${roleId}-skill-${i + 1}`,
    sourceFramework: c.sourceFrameworkId,
    isMarketplaceSkill: c.isMarketplaceSkill,
    // V1.5 L2/L3 defaults
    prerequisites: c.prerequisites || [],
    failureModes: [],
    sourceTier: c.sourceTier || 'inferred',
    dependsOn: [],
    conflictsWith: [],
    triggers: [],
    strategicLink: '',
  }));
}