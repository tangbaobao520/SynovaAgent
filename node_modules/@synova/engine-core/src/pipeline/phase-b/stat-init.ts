/**
 * pipeline/phase-b/stat-init.ts — 零LLM冷启动基因组推导
 *
 * 实现 AR-08 的 StatInit 方案：
 *   当 Phase B 的 LLM 调用不可用（降级模式）或 cold_start 场景下，
 *   不依赖 LLM，仅用统计规则 + 角色类型映射表生成可用的 PersonaGenome 骨架。
 *
 * 三层 Fallback 策略：
 *   Tier-1: 角色类型命中 → 使用角色类型→框架映射表（最精准）
 *   Tier-2: 任务域轮询 → 使用任务域→通用框架映射（Tier-1 未命中时）
 *   Tier-3: 通用默认框架 → 通用的 2 个默认心智模型（Tier-2 也未命中时）
 *
 * 产出：
 *   - derivationMethod: 'stat_init'
 *   - confidence: 固定 0.2（标注为"规则推导，非 LLM 生成"）
 *   - mentalModels: 2-3 个通用心智模型（不含角色特化 application）
 *
 * @packageDocumentation
 */

import type { PersonaGenomeBlue, TeamStructureBlue } from '../../types';

// ================================================================
// 角色类型→心智框架映射表（扩展核心）
// ================================================================

/**
 * 角色类型定义
 * 每个角色可以有多个 type 标签，StatInit 用第一个命中的标签选择框架
 */
export interface RoleTypeEntry {
  /** 角色标题/别名中的匹配关键词 */
  keywords: string[];
  /** 命中的心智框架列表（每个框架名与认知库框架对齐） */
  frames: StatInitFrame[];
}

export interface StatInitFrame {
  name: string;
  oneLiner: string;
  source: string;
}

/**
 * 角色类型→通用框架映射表
 *
 * 此表是引擎内置知识的核心内容。每个条目对应一种可识别的角色类型。
 * 命名规范：keywords 使用角色名中常见的后缀/前缀/关键词。
 */
const ROLE_FRAME_MAP: RoleTypeEntry[] = [
  // ── 管理/领导类 ──
  {
    keywords: ['负责人', '主管', '经理', '总监', 'leader', 'manager', 'head', 'director', '管理者'],
    frames: [
      { name: '一收一放', oneLiner: '收是机制设定，放是自治权释放，两者互相增强而非矛盾', source: 'cultureforge:frame:one_gather_one_release' },
      { name: '窗口期优先', oneLiner: '窗口期判断优先于技术完美，降级方案胜过错过时机', source: 'cultureforge:frame:window_priority' },
    ],
  },
  // ── 决策/战略类 ──
  {
    keywords: ['决策', '战略', '策略', '规划', 'strategy', 'decision', 'planning', 'architect'],
    frames: [
      { name: 'JTBD第一性原理', oneLiner: '从任务反推结构，不从角色反推任务；用户要完成的"任务"决定一切', source: 'cultureforge:frame:jtbd_first_principle' },
      { name: '逆向工程证据定位', oneLiner: '不是阅读信源，是探查心智模型；拆分为可证伪问题逐一定位', source: 'cultureforge:frame:reverse_engineer_evidence' },
    ],
  },
  // ── 技术/工程类 ──
  {
    keywords: ['技术', '开发', '工程师', '工程', '研发', 'tech', 'developer', 'engineer', 'programmer', 'architect'],
    frames: [
      { name: '诚实审计三段论', oneLiner: '生成→审计→裁决角色分离，不能让同一个Agent审自己的产出', source: 'cultureforge:frame:honest_audit_triad' },
      { name: '安全边际优先', oneLiner: '用工程学安全边际类比组织设计，保留足够冗余应对极端情况', source: 'cultureforge:frame:safety_margin' },
    ],
  },
  // ── 市场/运营类 ──
  {
    keywords: ['市场', '运营', '营销', '增长', '推广', 'marketing', 'growth', 'operation', 'brand'],
    frames: [
      { name: '一收一放', oneLiner: '收是机制设定，放是自治权释放，两者互相增强而非矛盾', source: 'cultureforge:frame:one_gather_one_release' },
      { name: '被广泛归因 ≠ 确实说过', oneLiner: 'Tier-1 信源优先，不把"被广泛归因"当作"确实说过"', source: 'cultureforge:frame:tier1_priority' },
    ],
  },
  // ── 产品/设计类 ──
  {
    keywords: ['产品', '设计', '体验', 'product', 'designer', 'ux', 'ui'],
    frames: [
      { name: 'JTBD第一性原理', oneLiner: '从任务反推结构，不从角色反推任务；用户要完成的"任务"决定一切', source: 'cultureforge:frame:jtbd_first_principle' },
      { name: 'not_found是合法产出', oneLiner: '不把"找不到"偷偷变成推断，沉默本身就是信息', source: 'cultureforge:frame:not_found_is_valid' },
    ],
  },
  // ── 财务/风控类 ──
  {
    keywords: ['财务', '风控', '审计', '合规', 'finance', 'risk', 'audit', 'compliance', '法务'],
    frames: [
      { name: '诚实边界法则', oneLiner: '"已做"和"已知"必须基于可观测事实，不满足条件必须以"我推断"开头', source: 'cultureforge:frame:honest_boundary' },
      { name: '安全边际优先', oneLiner: '用工程学安全边际类比组织设计，保留足够冗余应对极端情况', source: 'cultureforge:frame:safety_margin' },
    ],
  },
  // ── 销售/商务类 ──
  {
    keywords: ['销售', '商务', '客户', 'bd', 'sales', 'business', 'account', '客户经理'],
    frames: [
      { name: '窗口期优先', oneLiner: '窗口期判断优先于技术完美，降级方案胜过错过时机', source: 'cultureforge:frame:window_priority' },
      { name: 'not_found是合法产出', oneLiner: '不把"找不到"偷偷变成推断，沉默本身就是信息', source: 'cultureforge:frame:not_found_is_valid' },
    ],
  },
  // ── 人力/行政类 ──
  {
    keywords: ['人力', '行政', '招聘', 'hr', 'human', 'recruitment', 'admin'],
    frames: [
      { name: '诚实审计三段论', oneLiner: '生成→审计→裁决角色分离，不能让同一个Agent审自己的产出', source: 'cultureforge:frame:honest_audit_triad' },
      { name: 'not_found是合法产出', oneLiner: '不把"找不到"偷偷变成推断，沉默本身就是信息', source: 'cultureforge:frame:not_found_is_valid' },
    ],
  },
  // ── 顾问/咨询类 ──
  {
    keywords: ['顾问', '咨询', '分析', 'consultant', 'analyst', 'advisor'],
    frames: [
      { name: 'JTBD第一性原理', oneLiner: '从任务反推结构，不从角色反推任务；用户要完成的"任务"决定一切', source: 'cultureforge:frame:jtbd_first_principle' },
      { name: '诚实审计三段论', oneLiner: '生成→审计→裁决角色分离，不能让同一个Agent审自己的产出', source: 'cultureforge:frame:honest_audit_triad' },
      { name: '逆向工程证据定位', oneLiner: '不是阅读信源，是探查心智模型；拆分为可证伪问题逐一定位', source: 'cultureforge:frame:reverse_engineer_evidence' },
    ],
  },
];

// ================================================================
// 任务域→通用框架映射（Tier-2 fallback）
// ================================================================

/**
 * 任务域关键词匹配（当角色类型未命中时，根据任务描述匹配）
 * 每个域对应一组通用心智框架
 */
const TASK_DOMAIN_MAP: Array<{
  keywords: string[];
  frames: StatInitFrame[];
}> = [
  {
    keywords: ['电商', '跨境', '供应链', '物流', '采购', 'ecommerce', 'supply chain', 'logistics'],
    frames: [
      { name: '一收一放', oneLiner: '收是机制设定，放是自治权释放，两者互相增强而非矛盾', source: 'cultureforge:frame:one_gather_one_release' },
      { name: '安全边际优先', oneLiner: '用工程学安全边际类比组织设计，保留足够冗余应对极端情况', source: 'cultureforge:frame:safety_margin' },
    ],
  },
  {
    keywords: ['金融', '支付', '风控', '合规', 'finance', 'payment', 'risk'],
    frames: [
      { name: '诚实边界法则', oneLiner: '"已做"和"已知"必须基于可观测事实，不满足条件必须以"我推断"开头', source: 'cultureforge:frame:honest_boundary' },
      { name: '安全边际优先', oneLiner: '用工程学安全边际类比组织设计，保留足够冗余应对极端情况', source: 'cultureforge:frame:safety_margin' },
    ],
  },
  {
    keywords: ['内容', '社区', '社交', '媒体', 'content', 'community', 'social', 'media'],
    frames: [
      { name: 'not_found是合法产出', oneLiner: '不把"找不到"偷偷变成推断，沉默本身就是信息', source: 'cultureforge:frame:not_found_is_valid' },
      { name: 'JTBD第一性原理', oneLiner: '从任务反推结构，不从角色反推任务；用户要完成的"任务"决定一切', source: 'cultureforge:frame:jtbd_first_principle' },
    ],
  },
  {
    keywords: ['游戏', '娱乐', 'gaming', 'entertainment'],
    frames: [
      { name: '窗口期优先', oneLiner: '窗口期判断优先于技术完美，降级方案胜过错过时机', source: 'cultureforge:frame:window_priority' },
      { name: '一收一放', oneLiner: '收是机制设定，放是自治权释放，两者互相增强而非矛盾', source: 'cultureforge:frame:one_gather_one_release' },
    ],
  },
];

// ================================================================
// Tier-3: 默认通用框架（任何角色兜底）
// ================================================================

const DEFAULT_FRAMES: StatInitFrame[] = [
  { name: 'JTBD第一性原理', oneLiner: '从任务反推结构，不从角色反推任务；用户要完成的"任务"决定一切', source: 'cultureforge:frame:jtbd_first_principle' },
  { name: '诚实边界法则', oneLiner: '"已做"和"已知"必须基于可观测事实，不满足条件必须以"我推断"开头', source: 'cultureforge:frame:honest_boundary' },
  { name: 'not_found是合法产出', oneLiner: '不把"找不到"偷偷变成推断，沉默本身就是信息', source: 'cultureforge:frame:not_found_is_valid' },
];

// ================================================================
// 核心函数
// ================================================================

/**
 * 根据角色名称匹配角色类型
 */
function matchRoleType(roleName: string): StatInitFrame[] | null {
  const lower = roleName.toLowerCase();
  for (const entry of ROLE_FRAME_MAP) {
    for (const kw of entry.keywords) {
      if (lower.includes(kw.toLowerCase())) {
        return entry.frames;
      }
    }
  }
  return null;
}

/**
 * 根据任务描述匹配任务域
 */
function matchTaskDomain(taskJob: string): StatInitFrame[] | null {
  const lower = taskJob.toLowerCase();
  for (const entry of TASK_DOMAIN_MAP) {
    for (const kw of entry.keywords) {
      if (lower.includes(kw.toLowerCase())) {
        return entry.frames;
      }
    }
  }
  return null;
}

/**
 * OCEAN 默认值生成（基于角色类型衍生）
 *
 * 当 LLM 不可用时，用角色类型推断合理的默认 OCEAN 配置。
 * 不追求精确，只保证不出现全 0.5 的"假默认值"。
 */
function deriveDefaultOcean(roleName: string): PersonaGenomeBlue['oceanScores'] {
  const lower = roleName.toLowerCase();

  // 管理/领导类：高尽责性、中外向性
  if (lower.includes('负责人') || lower.includes('主管') || lower.includes('经理') || lower.includes('leader')) {
    return { openness: 0.55, conscientiousness: 0.80, extraversion: 0.65, agreeableness: 0.50, neuroticism: 0.35 };
  }
  // 技术类：高开放性（对新方法的好奇）、低外向性
  if (lower.includes('技术') || lower.includes('工程') || lower.includes('开发') || lower.includes('engineer')) {
    return { openness: 0.75, conscientiousness: 0.70, extraversion: 0.40, agreeableness: 0.55, neuroticism: 0.30 };
  }
  // 市场/销售类：高外向性、高开放性
  if (lower.includes('市场') || lower.includes('销售') || lower.includes('营销') || lower.includes('sales')) {
    return { openness: 0.70, conscientiousness: 0.65, extraversion: 0.80, agreeableness: 0.55, neuroticism: 0.40 };
  }
  // 风控/合规类：高尽责性、低开放性（保守）
  if (lower.includes('风控') || lower.includes('合规') || lower.includes('审计') || lower.includes('法务')) {
    return { openness: 0.45, conscientiousness: 0.85, extraversion: 0.40, agreeableness: 0.50, neuroticism: 0.50 };
  }
  // 默认：中位偏一点，明确不是全0.5
  return { openness: 0.55, conscientiousness: 0.65, extraversion: 0.50, agreeableness: 0.55, neuroticism: 0.45 };
}

/**
 * 为单个角色生成 StatInit 基因组
 */
function generateStatInitGenome(
  roleName: string,
  roleId: string,
  frames: StatInitFrame[],
): PersonaGenomeBlue {
  const mentalModels = frames.map((f, idx) => ({
    name: f.name,
    oneLiner: f.oneLiner,
    source: f.source,
    application: `（StatInit 规则推导模板 —— 此 application 为通用占位，建议在 LLM 可用时重新生成角色特化版本）`,
    limitation: `（StatInit 规则推导模板 —— 此 limitation 为通用占位，未经角色特化）`,
    decisionScenarios: [] as string[],
  }));

  return {
    roleId,
    roleName,
    oceanScores: deriveDefaultOcean(roleName),
    mentalModels,
    honestBoundaries: [
      '此角色的认知基因由 StatInit 规则推导引擎生成，未经过 LLM 蒸馏',
      'metalModels 为通用框架模板，未经角色特化，建议在 LLM 可用时重新生成',
    ],
    antiPatterns: [
      '不要将 StatInit 产出的通用框架当作角色特化的精确认知模型使用',
      '不要依赖通用 application 描述做具体决策——需要人工审核和调整',
    ],
    confidence: 0.2,  // 固定 0.2，标注为"规则推导"
  };
}

// ================================================================
// 主入口
// ================================================================

/**
 * 主入口：使用零 LLM 统计规则生成可用 PersonaGenome 列表
 *
 * 三层 Fallback:
 *   Tier-1: 按角色类型匹配框架（最精准）
 *   Tier-2: 按任务域匹配框架（次精准）
 *   Tier-3: 通用默认框架（兜底，总能产出至少 2 个框架）
 *
 * @param teamStructure - L1 产出的团队结构
 * @param taskJob - 用户原始任务描述（用于 Tier-2 匹配）
 * @returns PhaseBResult 兼容产出（derivationMethod: 'stat_init', confidence: 0.2 固定）
 */
export function runStatInit(
  teamStructure: TeamStructureBlue,
  taskJob: string,
): PersonaGenomeBlue[] {
  const genomes: PersonaGenomeBlue[] = [];

  for (const role of teamStructure.roles) {
    // Tier-1：尝试按角色类型匹配
    let frames = matchRoleType(role.name);

    if (!frames || frames.length === 0) {
      // Tier-2：尝试按任务域匹配
      frames = matchTaskDomain(taskJob);
    }

    if (!frames || frames.length === 0) {
      // Tier-3：通用默认框架
      frames = DEFAULT_FRAMES;
    }

    // 限制框架数量不超过 3 个（StatInit 是降级模式，不追求完整）
    const selectedFrames = frames.slice(0, 3);

    genomes.push(generateStatInitGenome(role.name, role.id, selectedFrames));
  }

  return genomes;
}

/**
 * 判断当前场景是否应该触发 StatInit
 *
 * StatInit 是降级模式，在以下条件触发：
 *   1. teamStructure 的 derivationMethod 为 'cold_start' 或 'minimal_default'
 *   2. （可选）显式降级参数
 *
 * @param teamStructure - L1 产出的团队结构
 * @param forceDegrade - 是否强制降级（运行时参数，如环境变量 ENGINE_DEGRADE=true）
 * @returns 是否应使用 StatInit
 */
export function shouldUseStatInit(
  teamStructure: TeamStructureBlue,
  forceDegrade?: boolean,
): boolean {
  if (forceDegrade) return true;
  return teamStructure.derivationMethod === 'cold_start' || teamStructure.derivationMethod === 'minimal_default';
}
