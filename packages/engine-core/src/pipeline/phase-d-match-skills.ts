/**
 * engine-server/pipeline/phase-d-match-skills.ts — Phase D (L4): 匹配技能集
 *
 * V1.4: "engine determines WHAT, LLM fills details" hybrid pattern.
 * 引擎从匹配框架的 skillPatterns 中提取技能核心（name/summary/tags/category），
 * LLM 负责填充 scenarios/steps/description 细节并补全缺口。
 *
 * 输入：TaskDefinitionDTO + Phase A + Phase B + Phase C 结果
 * 输出：SkillSetBlue[]（含 SkillCard[]）+ IncubationFrame
 */

import type {
  TaskDefinitionDTO,
  PhaseAResult,
  PhaseBResult,
  PhaseCResult,
  PhaseDResult,
  SkillSetBlue,
  SkillCard,
  IncubationFrame,
  PersonaGenomeBlue,
} from '../types';
import { PHASE_LABELS } from '../types';
import { chat } from '../llm-client';
import { mapSkillsForTeam, buildSkillPromptSections, buildSkillCardsFromCores, enrichCoresWithCloud, type MappedSkillCore } from './skill-mapper';
import { extractJSON, repairLlmJson } from './llm-json-repair';
import { ALL_SEED_SKILLS } from './skill-seeds';
import { getEngineContext } from '../engine-context';
import { createLogger } from '../infra/logger';

const log = createLogger('engine-server/pipeline/phase-d-match-skills');

// ================================================================
// 分块工具
// ================================================================

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ================================================================
// LLM 输出类型（替代 as any）
// ================================================================

interface LLMSkillEntry {
  name?: string;
  summary?: string;
  description?: string;
  scenarios?: string[];
  steps?: string[];
  version?: string;
  installCommand?: string;
  prerequisites?: string[];
  failureModes?: string[];
  sourceTier?: string;
  dependsOn?: string[];
  conflictsWith?: string[];
  triggers?: string[];
  strategicLink?: string;
  geneSources?: Array<{
    kind?: string;
    name?: string;
    mapsTo?: string;
  }>;
  approvalRequired?: string[];
  category?: string;
  tags?: string[];
}

// ================================================================
// 安装指令生成辅助
// ================================================================

/** 从种子数据构建名称→技能模式的索引 Map */
const SEED_SKILL_MAP = new Map(ALL_SEED_SKILLS.map(s => [s.name, s]));

/**
 * 根据技能名称和分类生成合理的默认安装指令。
 * 优先从种子数据查找，其次按名称关键词匹配，最后按分类兜底。
 */
function generateDefaultInstallCommand(
  name: string,
  category?: string,
  tags?: string[],
): string {
  // 从种子数据查找（种子数据自身没有 installCommand，但可以生成一致指令）
  const seed = SEED_SKILL_MAP.get(name);
  if (seed) {
    const isVerified = seed.sourceTier === 'verified';
    return isVerified
      ? `claworg skill install --seed "${name}"`
      : `manual: 设置 ${name} 所需的配置和依赖`;
  }

  const nameLower = name.toLowerCase();
  const catLower = (category || '').toLowerCase();
  const tagList = tags || [];

  // 常见工具/API 集成
  if (nameLower.includes('notion')) return 'manual: Notion API integration — register integration at https://developers.notion.com';
  if (nameLower.includes('slack')) return 'manual: Slack webhook setup — configure incoming webhook at https://api.slack.com';
  if (nameLower.includes('git')) return 'manual: Git CLI — install from https://git-scm.com';
  if (nameLower.includes('docker')) return 'manual: Docker Engine — install from https://docs.docker.com/engine/install';
  if (nameLower.includes('aws')) return 'manual: AWS CLI — configure via `aws configure`';
  if (nameLower.includes('jira') || nameLower.includes('confluence')) return 'manual: Atlassian API token — generate from https://id.atlassian.com/manage/api-tokens';
  if (nameLower.includes('github') || nameLower.includes('gh ')) return 'manual: GitHub CLI — install from https://cli.github.com';
  if (nameLower.includes('excel') || nameLower.includes('sheet')) return 'manual: Spreadsheet API integration — enable Google Sheets API or Office Scripts';
  if (nameLower.includes('sql') || nameLower.includes('database') || nameLower.includes('db ')) return 'manual: Database connection setup — configure credentials and connection string';
  if (nameLower.includes('python') || nameLower.includes('pip')) return 'pip install ' + nameLower.replace(/[^a-z0-9_-]/g, '-');
  if (nameLower.includes('npm') || nameLower.includes('node') || nameLower.includes('react') || nameLower.includes('vue')) return 'npm install ' + nameLower.replace(/[^a-z0-9_-]/g, '-');

  // 分类兜底
  if (catLower.includes('数据') || catLower.includes('分析') || tagList.some(t => /数据|分析|data/.test(t))) return 'pip install data-analysis-toolkit';
  if (catLower.includes('开发') || tagList.some(t => /代码|编程|code|dev/.test(t))) return 'npm install dev-toolkit';
  if (catLower.includes('合规') || catLower.includes('法务') || catLower.includes('审计') || catLower.includes('法律')) return 'manual: compliance workflow integration — configure approval chain';
  if (catLower.includes('营销') || tagList.some(t => /营销|social|推广/.test(t))) return 'manual: marketing platform API setup — configure API keys';
  if (catLower.includes('翻译') || tagList.some(t => /翻译|translate/.test(t))) return 'pip install translation-service';
  if (catLower.includes('内容') || catLower.includes('创作')) return 'manual: content creation tool setup';
  if (tagList.some(t => /安全|security|隐私|privacy/.test(t))) return 'manual: security tool integration — review access controls';

  return `manual: 配置 ${name} 所需的环境和权限`;
}

/**
 * 生成合理的默认版本号。
 * 种子数据返回固定版本，LLM 生成的返回 latest。
 */
function generateDefaultVersion(skillName: string, fromSeed: boolean): string {
  return fromSeed ? '1.0.0' : 'latest';
}

/**
 * 当 LLM 未返回 steps 时，根据技能名称和描述生成合理的默认执行步骤。
 * 避免 Judge 因 steps=[] 给出 20/100 的技能可行性评分。
 */
function generateDefaultSteps(name: string, description?: string): string[] {
  const n = name.toLowerCase();
  const d = (description || '').toLowerCase();

  // 信息检索/监控类
  if (n.includes('搜索') || n.includes('检索') || n.includes('监控') || n.includes('调研') ||
      d.includes('搜索') || d.includes('检索') || d.includes('调研')) {
    return ['明确检索目标和关键词', '执行检索并筛选高质量信息源', '整理检索结果并输出结构化摘要'];
  }

  // 分析/评估类
  if (n.includes('分析') || n.includes('评估') || n.includes('诊断') ||
      d.includes('分析') || d.includes('评估')) {
    return ['收集分析所需的原始数据和背景信息', '应用分析框架/模型识别关键模式和问题', '输出分析报告，附带可执行的建议'];
  }

  // 策划/规划类
  if (n.includes('策划') || n.includes('规划') || n.includes('计划') || n.includes('方案') ||
      d.includes('策划') || d.includes('规划') || d.includes('方案')) {
    return ['明确目标、受众和成功标准', '制定详细执行计划，包含时间表和资源需求', '输出方案文档，标注关键决策点和风险'];
  }

  // 沟通/协调类
  if (n.includes('沟通') || n.includes('协调') || n.includes('对接') || n.includes('谈判') ||
      d.includes('沟通') || d.includes('协调') || d.includes('对接')) {
    return ['明确沟通目标和利益相关方', '准备沟通材料（邮件/PPT/会议议程）', '执行沟通并记录关键结论和待办事项'];
  }

  // 执行/操作类
  if (n.includes('执行') || n.includes('实施') || n.includes('部署') || n.includes('操作') ||
      d.includes('执行') || d.includes('部署')) {
    return ['确认前置条件和依赖已就绪', '按操作手册执行步骤，记录关键中间状态', '验证结果并回写操作日志'];
  }

  // 审查/审核类
  if (n.includes('审查') || n.includes('审核') || n.includes('检查') || n.includes('合规') ||
      d.includes('审查') || d.includes('审核') || d.includes('合规')) {
    return ['制定审核清单和检查标准', '逐项对照检查，记录符合/不符合项', '输出审核报告，标注必须整改的高风险项'];
  }

  // 创作/写作类
  if (n.includes('写作') || n.includes('创作') || n.includes('编写') || n.includes('文案') ||
      d.includes('写作') || d.includes('创作') || d.includes('文案')) {
    return ['确定内容大纲和关键信息点', '撰写初稿，确保逻辑连贯和核心信息传达', '修订润色，检查准确性和可读性'];
  }

  // 通用默认
  return ['明确任务目标和成功标准', '收集必要信息并按流程执行', '验证结果并输出总结'];
}

// ================================================================
// 上游约束注入（AR-12: L0-L3 → L4 交叉投影）
// ================================================================

function buildConstraintInjectionSection(
  taskDef: TaskDefinitionDTO,
  phaseA: PhaseAResult,
  phaseB: PhaseBResult,
  phaseC: PhaseCResult,
): string {
  const parts: string[] = [];
  parts.push('【上游约束 — 请注入到技能中】');

  // L0 constraints → skills notes/applicableScenarios
  if (taskDef.constraints.length > 0) {
    parts.push(`L0 任务约束（请注入到相关技能的 notes 或 applicableScenarios）:`);
    for (const c of taskDef.constraints) {
      parts.push(`  - ${c}`);
    }
  }

  // L0 failureModes → skills antiPatterns
  if (taskDef.failureModes.length > 0) {
    parts.push(`L0 失败模式（请转化为相关技能的 antiPatterns）:`);
    for (const f of taskDef.failureModes) {
      parts.push(`  - ${f}`);
    }
  }

  // L2 mentalModels → skills applicableScenarios / geneSources
  for (const genome of phaseB.personaGenomes) {
    if (genome.mentalModels.length > 0) {
      const modelLines = genome.mentalModels.map(m =>
        `  - ${m.name}（${m.application || '通用场景'}）`);
      parts.push(`L2 ${genome.roleName} 的心智模型（请映射到该角色技能的 applicableScenarios）:\n${modelLines.join('\n')}`);
    }
    if (genome.antiPatterns.length > 0) {
      const apLines = genome.antiPatterns.map(a => `  - ${a}`);
      parts.push(`L2 ${genome.roleName} 的反模式（请映射到该角色技能的 antiPatterns）:\n${apLines.join('\n')}`);
    }
  }

  // L3 protocol → skills approvalRequired
  parts.push(`L3 协作模式: ${phaseC.collaborationMode.mode}（${phaseC.collaborationMode.label}）— 请在相关技能的 approvalRequired 中标注哪些步骤需要上级确认`);

  return parts.join('\n\n');
}

// ================================================================
// System Prompt
// ================================================================

function buildSystemPrompt(locale: string): string {
  return `你是一个技能匹配专家。引擎已预选部分技能核心（name/summary/category/tags 已确定），你的任务是为它们补充细节，并为缺口角色从零生成技能。

你必须输出严格格式的 JSON。不要输出其他内容。

输出格式：
{
  "skillSets": [
    {
      "roleId": "角色ID",
      "roleName": "角色名称",
      "skills": [
        {
          "id": "技能ID（引擎已生成的保留原id，新产出的用 \${roleId}-skill-\${N}）",
          "name": "技能名称",
          "summary": "一句话摘要",
          "description": "详细说明（2-3句）",
          "scenarios": ["使用场景1", "使用场景2"],
          "steps": ["执行步骤1", "执行步骤2", "执行步骤3"],
          "prerequisites": ["使用此技能前需具备的信息或条件"],
          "failureModes": ["此技能常见的失败方式"],
          "sourceTier": "verified | inferred | speculative",
          "dependsOn": ["依赖的其他技能名称"],
          "conflictsWith": [],
          "triggers": ["触发此技能的条件"],
          "strategicLink": "此技能服务的战略目标",
          "version": "版本号，如 1.0.0（引擎种子数据）或 latest（LLM新生成）",
          "installCommand": "安装指令，必须是以下格式之一：npm install <包名>、pip install <包名>、apt-get install <包名>、manual: <具体手动步骤>。禁止填'可安装'或其他占位符。",
          "antiPatterns": ["此技能不应做的事情（来自L2反模式或L0失败模式的推导）"],
          "approvalRequired": ["需要上级审批的操作步骤（来自L3协作模式的推导），无则空数组"],
          "geneSources": [
            {
              "kind": "mentalModel | antiPattern | bias | expressionDNA",
              "name": "认知基因名称，如 逆向思考",
              "mapsTo": "映射到的技能步骤，如 步骤5（备案被拒的兜底预案）"
            }
          ]
        }
      ]
    }
  ],
  "statusLine": "一行中文状态描述",
  "detail": "更详细的描述"
}

设计原则：
1. 每个角色至少 2 个技能
2. 引擎已预选的技能：name/summary/category/tags 不可变，只补 scenarios/steps/description/version/installCommand 和 L2/L3 字段
3. 引擎未覆盖的角色：从零生成完整技能，必须包含 version 和 installCommand
4. scenarios 描述什么情况下使用该技能（2-4个）
5. steps 是必填项，每个技能至少3个具体操作步骤。步骤必须是可执行的动作描述（如"收集XX数据"、"调用XX工具分析"），不能是抽象概念或空数组。步骤数量不足将导致该技能评分归零
6. 技能必须与角色职责和协作模式匹配
7. prerequisites 列出使用该技能前必须具备的信息或前置技能（1-3项，无则空数组）
8. failureModes 列出该技能执行中常见的失败方式（1-3项，无则空数组）
9. sourceTier 基于推导来源标注：verified(有框架/弹药支撑) | inferred(引擎推导) | speculative(LLM推测生成)
10. dependsOn 列出此技能依赖的其他技能名称（无依赖则空数组）
11. version 必须为具体版本号或 "latest"，不可为空
12. installCommand 必須是可执行的安装指令，必须以 npm/pip/apt-get/manual: 开头。严禁使用"可安装"、"[可安装]"、"需手动安装"等占位符——必须写出具体的包名或安装步骤。例如："pip install pandas"、"npm install axios"、"apt-get install jq"、"manual: 在系统设置中启用XXX功能"
13. antiPatterns 必须具体、可操作——避免泛泛而谈（如"不要犯错"），应直指具体盲区（如"不要假设供应商会主动申请FORM E"）。优先从上游 L2 反模式推导
14. approvalRequired 标注需要上级确认的步骤——基于 L3 协作模式推导。若为 iron_captain 模式，关键决策步骤都应标注；若为 agile_nomads 模式，可能为空
15. geneSources 标注技能的每个关键步骤/规则来源于哪个认知基因（L2 mentalModel 或 antiPattern）——这是技能可追溯性的核心

当前语言：${locale}`;
}

// ================================================================
// User Prompt
// ================================================================

function buildUserPrompt(
  taskDef: TaskDefinitionDTO,
  phaseA: PhaseAResult,
  phaseB: PhaseBResult,
  phaseC: PhaseCResult,
  enginePromptSection: string,
): string {
  const rolesDesc = phaseA.teamStructure.roles
    .map((r) => `  - ${r.id}: ${r.name}, 职责: ${r.responsibilities.join('、')}, 技能需求: ${r.skillsRequired.join('、')}`)
    .join('\n');

  const constraintSection = buildConstraintInjectionSection(taskDef, phaseA, phaseB, phaseC);

  return `请为以下团队的每个角色匹配合适的技能：

任务：${taskDef.job}
约束：${taskDef.constraints.join('；')}
协作模式：${phaseC.collaborationMode.label}（${phaseC.collaborationMode.mode}）

角色职责：
${rolesDesc}

${constraintSection}

${enginePromptSection}

请为每个角色生成技能清单。只输出 JSON。`;
}

// ================================================================
// JSON 提取 + 修复
// ================================================================

function extractAndRepairJSON(content: string): string {
  // Step 1: 标准提取 + 修复（尾随逗号/无引号键/注释）
  try {
    return extractJSON(content);
  } catch (_e) { log.debug('extractJSON 失败，尝试降级路径: %s', String(_e)); }

  // Step 2: 手动提取 + 修复
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return repairLlmJson(jsonMatch[0]);
  }
  throw new Error('无法从 LLM 响应中提取 JSON');
}

/**
 * 渐进式 JSON 修复：从尾部逐步截断查找最后一个合法位置，补全缺失的括号。
 * 用于修复 LLM 在生成大型 JSON 时尾部截断的问题。
 */
function rescueTruncatedJSON(jsonStr: string): any {
  // 尝试 1: 直接解析
  try { return JSON.parse(jsonStr); } catch (_e) { /* 预期内失败，进入下一步修复策略 */ }

  // 尝试 2: 修复 + 解析
  const repaired = repairLlmJson(jsonStr);
  try { return JSON.parse(repaired); } catch (_e) { /* 预期内失败，进入下一步修复策略 */ }

  // 尝试 3: 从尾部逐步截断，找到能产生最多内容的合法位置
  let bestRescue: any = undefined;
  let bestLen = 0;
  for (let cut = jsonStr.length - 1; cut > Math.max(0, jsonStr.length - 500); cut--) {
    const trunk = jsonStr.slice(0, cut);
    let braceDepth = 0;
    let bracketDepth = 0;
    let inString = false;
    let escaped = false;
    for (const ch of trunk) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') braceDepth++;
      if (ch === '}') braceDepth--;
      if (ch === '[') bracketDepth++;
      if (ch === ']') bracketDepth--;
    }
    if (inString) continue;

    let closed = trunk;
    for (let i = 0; i < bracketDepth; i++) closed += ']';
    for (let i = 0; i < braceDepth; i++) closed += '}';

    try {
      const parsed = JSON.parse(closed);
      if (closed.length > bestLen) {
        bestRescue = parsed;
        bestLen = closed.length;
      }
    } catch (_e) { /* 此截断位置的 JSON 不合法，继续尝试下一个位置 */ }
  }
  if (bestRescue) return bestRescue;

  // 尝试 4: 双重修复（先修复再截断补全）
  const r2 = repairLlmJson(jsonStr);
  bestRescue = undefined;
  bestLen = 0;
  for (let cut = r2.length - 1; cut > Math.max(0, r2.length - 1000); cut--) {
    const trunk = r2.slice(0, cut);
    let braceDepth = 0;
    let bracketDepth = 0;
    let inString = false;
    let escaped = false;
    for (const ch of trunk) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') braceDepth++;
      if (ch === '}') braceDepth--;
      if (ch === '[') bracketDepth++;
      if (ch === ']') bracketDepth--;
    }
    if (inString) continue;
    let closed = trunk;
    for (let i = 0; i < bracketDepth; i++) closed += ']';
    for (let i = 0; i < braceDepth; i++) closed += '}';
    try {
      const parsed = JSON.parse(closed);
      if (closed.length > bestLen) {
        bestRescue = parsed;
        bestLen = closed.length;
      }
    } catch (_e) { /* 此截断位置的 JSON 不合法，继续尝试下一个位置 */ }
  }
  if (bestRescue) return bestRescue;

  throw new Error('JSON 修复失败：无法恢复截断的 JSON');
}

function sanitizeInstallCommand(cmd: string | undefined | null, skillName: string, category?: string, tags?: string[]): string {
  if (!cmd || cmd.trim().length === 0) return generateDefaultInstallCommand(skillName, category, tags);
  const clean = cmd.trim();
  // 拒绝常见的 LLM 占位符
  const placeholders = /^(可安装|\[可安装\]|需手动安装|手动安装|待定|TBD|TODO|N\/A|无|暂无|placeholder)$/i;
  if (placeholders.test(clean)) return generateDefaultInstallCommand(skillName, category, tags);
  // 必须以 npm/pip/apt-get/manual: 开头
  if (!/^(npm |pip |apt-get |manual:)/i.test(clean)) return generateDefaultInstallCommand(skillName, category, tags);
  return clean;
}

// ================================================================
// 合并引擎核心与 LLM 细节
// ================================================================

function mergeToSkillCards(
  llmSkillSets: LLMSkillEntry[],
  engineMapping: Map<string, MappedSkillCore[]>,
  roleId: string,
): SkillCard[] {
  const cores = engineMapping.get(roleId) || [];
  const coreMap = new Map(cores.map(c => [c.name, c]));
  const seen = new Set<string>();

  const cards: SkillCard[] = [];

  // 先处理引擎已映射的技能：name/summary/tags/category 来自引擎，scenarios/steps 来自 LLM
  for (const core of cores) {
    seen.add(core.name);
    const llmMatch = llmSkillSets.find((s) => s.name === core.name);
    const stepsFromLlm = Array.isArray(llmMatch?.steps) && llmMatch!.steps!.length > 0 ? llmMatch!.steps! : null;
    const steps = stepsFromLlm || generateDefaultSteps(core.name, llmMatch?.description);
    cards.push({
      id: `${roleId}-skill-${cards.length + 1}`,
      name: core.name,
      summary: core.summary,
      description: llmMatch?.description || core.summary,
      scenarios: llmMatch?.scenarios || [],
      steps,
      tags: core.tags,
      category: core.category,
      version: llmMatch?.version || '1.0.0',
      securityScore: null,
      installCommand: sanitizeInstallCommand(llmMatch?.installCommand, core.name, core.category, core.tags),
      sourceFramework: core.sourceFrameworkId,
      isMarketplaceSkill: core.isMarketplaceSkill,
      // V1.5 L2/L3 from engine core (LLM may override)
      prerequisites: llmMatch?.prerequisites || core.prerequisites || [],
      failureModes: llmMatch?.failureModes || [],
      sourceTier: (llmMatch?.sourceTier || core.sourceTier || 'inferred') as SkillCard['sourceTier'],
      dependsOn: llmMatch?.dependsOn || [],
      conflictsWith: llmMatch?.conflictsWith || [],
      triggers: llmMatch?.triggers || [],
      strategicLink: llmMatch?.strategicLink || '',
      // V1.6 AR-12/AR-16: 上游约束反向引用
      geneSources: (Array.isArray(llmMatch?.geneSources) ? llmMatch.geneSources : []) as SkillCard['geneSources'],
      approvalRequired: Array.isArray(llmMatch?.approvalRequired) ? llmMatch.approvalRequired : [],
    });
  }

  // 再处理 LLM 自生成的缺口技能
  for (const s of llmSkillSets) {
    const skillName = s.name || '未命名技能';
    if (seen.has(skillName)) continue;
    seen.add(skillName);
    const gapStepsFromLlm = Array.isArray(s.steps) && s.steps.length > 0 ? s.steps : null;
    cards.push({
      id: `${roleId}-skill-${cards.length + 1}`,
      name: skillName,
      summary: s.summary || s.description || '',
      description: s.description || s.summary || '',
      scenarios: Array.isArray(s.scenarios) ? s.scenarios : [],
      steps: gapStepsFromLlm || generateDefaultSteps(skillName, s.description),
      tags: [],
      category: 'llm-generated',
      version: s.version || 'latest',
      securityScore: null,
      installCommand: sanitizeInstallCommand(s.installCommand, skillName, s.category, s.tags),
      isMarketplaceSkill: true,
      // V1.5 L2/L3 from LLM output
      prerequisites: Array.isArray(s.prerequisites) ? s.prerequisites : [],
      failureModes: Array.isArray(s.failureModes) ? s.failureModes : [],
      sourceTier: (s.sourceTier || 'speculative') as SkillCard['sourceTier'],
      dependsOn: Array.isArray(s.dependsOn) ? s.dependsOn : [],
      conflictsWith: Array.isArray(s.conflictsWith) ? s.conflictsWith : [],
      triggers: Array.isArray(s.triggers) ? s.triggers : [],
      strategicLink: s.strategicLink || '',
      // V1.6 AR-12/AR-16: 上游约束反向引用（LLM 生成）
      geneSources: (Array.isArray(s.geneSources) ? s.geneSources : []) as SkillCard['geneSources'],
      approvalRequired: Array.isArray(s.approvalRequired) ? s.approvalRequired : [],
    });
  }

  // ── Security audit: populate securityScore for each skill ──
  for (const card of cards) {
    try {
      const content = buildSkillAuditText(card);
      const report = getEngineContext().securityAudit.auditSkillContent(card.name, content);
      card.securityScore = report.score;
    } catch (_e) { log.debug('技能安全审计失败，使用默认分: %s', String(_e)); }
  }

  return cards;
}

/** 从 SkillCard 构建审计文本（关键词扫描用） */
function buildSkillAuditText(card: SkillCard): string {
  return [
    `# ${card.name}`,
    card.summary,
    card.description,
    ...card.steps,
    ...card.tags,
    ...(card.prerequisites || []),
    ...(card.failureModes || []),
    card.installCommand || '',
  ].join('\n');
}

// ================================================================
// 分块生成（角色数 > 3 时使用）
// ================================================================

async function generateSkillsChunked(
  taskDef: TaskDefinitionDTO,
  phaseA: PhaseAResult,
  phaseB: PhaseBResult,
  phaseC: PhaseCResult,
  locale: string,
  abortSignal: AbortSignal,
  mapping: Map<string, MappedSkillCore[]>,
): Promise<{ skillSets: SkillSetBlue[]; statusLine: string; detail: string; llmRaw: string }> {
  const allRoles = phaseA.teamStructure.roles;
  const chunks = chunkArray(allRoles, 3);
  const totalChunks = chunks.length;

  const chunkResults = await Promise.all(
    chunks.map(async (chunkRoles, chunkIndex) => {
      try {
        // 过滤 engine mapping 只含当前块角色
        const chunkMapping = new Map<string, MappedSkillCore[]>();
        for (const role of chunkRoles) {
          const cores = mapping.get(role.id);
          if (cores && cores.length > 0) {
            chunkMapping.set(role.id, cores);
          }
        }

        const engineSection = buildSkillPromptSections(chunkMapping);
        const rolesDesc = chunkRoles
          .map((r) => `  - ${r.id}: ${r.name}, 职责: ${r.responsibilities.join('、')}, 技能需求: ${r.skillsRequired.join('、')}`)
          .join('\n');

        const chunkLabel = totalChunks > 1 ? ` (第 ${chunkIndex + 1}/${totalChunks} 组)` : '';
        const constraintSection = buildConstraintInjectionSection(taskDef, phaseA, phaseB, phaseC);
        const userPrompt = `请为以下团队的每个角色匹配合适的技能${chunkLabel}：

任务：${taskDef.job}
约束：${taskDef.constraints.join('；')}
协作模式：${phaseC.collaborationMode.label}（${phaseC.collaborationMode.mode}）

角色职责：
${rolesDesc}

${constraintSection}

${engineSection}

请为以上每个角色生成技能清单。只输出 JSON。`;

        const result = await chat({
          systemPrompt: buildSystemPrompt(locale),
          userMessage: userPrompt,
          abortSignal,
          temperature: 0.6,
          maxTokens: 24000,
        });

        let parsed: any;
        const jsonStr = extractAndRepairJSON(result.content);
        try {
          parsed = JSON.parse(jsonStr);
        } catch (e1) {
          log.warn(`[phase-d] 块 ${chunkIndex + 1}/${totalChunks} JSON 解析失败（${(e1 as Error).message}），尝试截断补全...`);
          parsed = rescueTruncatedJSON(result.content);
          log.info(`[phase-d] 块 ${chunkIndex + 1}/${totalChunks} JSON 截断补全成功`);
        }

        return { chunkIndex, parsed, success: true };
      } catch (err) {
        log.warn(`[phase-d] 块 ${chunkIndex + 1}/${totalChunks} 致命错误: ${(err as Error).message}，降级为规则推导`);
        const fallbackSkills = chunkRoles.map(role => ({
          roleId: role.id,
          roleName: role.name,
          skills: buildSkillCardsFromCores(mapping.get(role.id) || [], role.id),
        }));
        return { chunkIndex, parsed: { skillSets: fallbackSkills }, success: false };
      }
    }),
  );

  // 合并所有块
  const allSkillSets: SkillSetBlue[] = [];
  let statusLine = '';
  let detail = '';
  const rawParts: string[] = [];

  for (const cr of chunkResults) {
    const chunkRoles = chunks[cr.chunkIndex];
    for (const role of chunkRoles) {
      const llmSkillSet = (cr.parsed.skillSets || []).find((ss: { roleId?: string; name?: string; skills?: LLMSkillEntry[] }) => ss.roleId === role.id);
      const skills = mergeToSkillCards(
        llmSkillSet?.skills || [],
        mapping,
        role.id,
      );
      allSkillSets.push({ roleId: role.id, roleName: role.name, skills });
    }

    rawParts.push(`[块${cr.chunkIndex + 1}]\n${JSON.stringify(cr.parsed)}`);
    if (!statusLine) {
      statusLine = cr.parsed.statusLine || '';
      detail = cr.parsed.detail || '';
    }
  }

  return { skillSets: allSkillSets, statusLine, detail, llmRaw: rawParts.join('\n---\n') };
}

// ================================================================
// 主函数
// ================================================================

export async function runPhaseD(
  taskDef: TaskDefinitionDTO,
  phaseA: PhaseAResult,
  phaseB: PhaseBResult,
  phaseC: PhaseCResult,
  locale: string,
  abortSignal: AbortSignal,
): Promise<PhaseDResult> {
  // ── Step 1: 引擎映射技能核心 ──
  const { mapping, gaps } = mapSkillsForTeam(phaseA.teamStructure.roles, taskDef.constraints);

  // ── Step 1.5: 云端市场兜底（本地未命中 → 云端查找）──
  let cloudHits = 0;
  try {
    const enriched = await enrichCoresWithCloud(mapping, abortSignal);
    cloudHits = [...enriched.values()]
      .flatMap(cores => cores.filter(c => c.isMarketplaceSkill && c.sourceFrameworkId === 'marketplace'))
      .length;
  } catch (err) {
    log.info(`[phase-d] 云端市场查找降级: ${(err as Error).message}`);
  }

  const enginePromptSection = buildSkillPromptSections(mapping);
  if (gaps.length > 0) {
    log.info(`[phase-d] 引擎技能缺口: ${gaps.join('; ')}`);
  }
  if (cloudHits > 0) {
    log.info(`[phase-d] 云端市场命中: ${cloudHits} 技能`);
  }

  try {
    // ── Step 2: LLM 填充细节 ──
    // 角色数 ≤3: 单次调用；>3: 分块生成（每块 3 个角色，Promise.all 并行）
    const allRoles = phaseA.teamStructure.roles;
    const useChunked = allRoles.length > 3;

    let skillSets: SkillSetBlue[];
    let statusLine: string;
    let detail: string;
    let llmRaw: string;

    if (useChunked) {
      log.info(`[phase-d] 角色数 ${allRoles.length} > 3，使用分块生成（每块3个角色，共${Math.ceil(allRoles.length / 3)}块并行）`);
      const chunked = await generateSkillsChunked(taskDef, phaseA, phaseB, phaseC, locale, abortSignal, mapping);
      skillSets = chunked.skillSets;
      statusLine = chunked.statusLine;
      detail = chunked.detail;
      llmRaw = chunked.llmRaw;
    } else {
      const result = await chat({
        systemPrompt: buildSystemPrompt(locale),
        userMessage: buildUserPrompt(taskDef, phaseA, phaseB, phaseC, enginePromptSection),
        abortSignal,
        temperature: 0.6,
        maxTokens: 24000,
      });

      let parsed: any;
      const jsonStr = extractAndRepairJSON(result.content);
      try {
        parsed = JSON.parse(jsonStr);
      } catch (e1) {
        log.warn(`[phase-d] JSON 解析失败（${(e1 as Error).message}），尝试截断补全...`);
        parsed = rescueTruncatedJSON(result.content);
        log.info(`[phase-d] JSON 截断补全成功`);
      }

      skillSets = allRoles.map((role) => ({
        roleId: role.id,
        roleName: role.name,
        skills: mergeToSkillCards(
          (parsed.skillSets || []).find((ss: { roleId?: string; name?: string; skills?: LLMSkillEntry[] }) => ss.roleId === role.id)?.skills || [],
          mapping,
          role.id,
        ),
      }));
      statusLine = parsed.statusLine || '';
      detail = parsed.detail || '';
      llmRaw = result.content;
    }

    const totalSkills = skillSets.reduce((sum, ss) => sum + ss.skills.length, 0);
    log.info(`[phase-d] 引擎+LLM 生成 ${skillSets.length} 角色 / ${totalSkills} 技能${gaps.length > 0 ? `（${gaps.length} 缺口已由LLM补全）` : ''}`);

    const incubationFrame: IncubationFrame = {
      phaseId: 'L4_match_skills',
      phaseLabel: PHASE_LABELS.L4_match_skills,
      progress: 80,
      statusLine: statusLine || `已为 ${skillSets.length} 个角色匹配 ${totalSkills} 个技能`,
      detail: detail || (gaps.length > 0 ? `LLM 补全 ${gaps.length} 处技能缺口` : '引擎映射 + LLM 填充完成'),
    };

    return { skillSets, incubationFrame, llmRaw };
  } catch (err) {
    // ── 降级路径: LLM 不可用 → 纯引擎映射 ──
    log.warn(`[phase-d] LLM 不可用，降级为引擎纯规则映射: ${(err as Error).message}`);
    const skillSets: SkillSetBlue[] = phaseA.teamStructure.roles.map((role) => ({
      roleId: role.id,
      roleName: role.name,
      skills: buildSkillCardsFromCores(mapping.get(role.id) || [], role.id),
    }));

    const totalSkills = skillSets.reduce((sum, ss) => sum + ss.skills.length, 0);
    const incubationFrame: IncubationFrame = {
      phaseId: 'L4_match_skills',
      phaseLabel: `${PHASE_LABELS.L4_match_skills}（降级）`,
      progress: 80,
      statusLine: `引擎降级：已为 ${skillSets.length} 个角色映射 ${totalSkills} 个技能核心`,
      detail: 'LLM 不可用，技能仅含核心元数据（scenarios/steps 待补全）',
    };

    return { skillSets, incubationFrame };
  }
}
