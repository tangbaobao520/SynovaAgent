/**
 * expert-prompts.ts — 专家提示词构建器 (文件驱动 — D69)
 *
 * D53+D58 文件驱动重构：从硬编码 DEFINITIONS 改为从 expert/{name}/
 * manifest.json + PROMPT.md 加载专家定义。
 *
 * 补充修正核心要求:
 *   "expert-prompts.ts从持有者变为加载器"
 *   "删除DEFINITIONS硬编码，改为readExpertManifest()从文件系统读取"
 *
 * 铁律 24+31: 降级路径 — manifest缺失/字段缺失 → log.warn + degraded + 默认值
 * 铁律 38: 零 as any
 */

import type { DiagnosisEvidence, DiagnosisHypothesis, ExpertType } from './types';
import * as fs from 'fs';
import * as path from 'path';

// ═══ Types ═══

export interface ExpertPromptContext {
  teamId: string;
  phase: number;
  evidence?: DiagnosisEvidence[];
  hypotheses?: DiagnosisHypothesis[];
}

export interface ExpertPrompt {
  systemPrompt: string;
  userMessage: string;
}

export interface ExpertDefinition {
  type: ExpertType;
  name: string;
  description: string;
  tone: string;
  boundaries: string[];
  /** 该专家使用的分析框架 */
  frameworks: string[];
  /** 输出结构要求 */
  outputFormat: string;
}

// ═══ ExpertType → manifest name mapping ═══

const EXPERT_TYPE_TO_MANIFEST: Record<string, string> = {
  strategic_analyst: 'strategy',
  org_diagnostician: 'org',
  financial_analyst: 'finance',
  tech_architect: 'tech',
  action_advisor: 'action',
  marketing_analyst: 'marketing',
};

// ═══ Manifest cache ═══

const manifestCache = new Map<string, ExpertDefinition>();

// ═══ Default definition factory ═══

function getDefaultDefinition(type: ExpertType): ExpertDefinition {
  return {
    type,
    name: type,
    description: '',
    tone: '',
    boundaries: [],
    frameworks: [],
    outputFormat: '',
  };
}

function buildOutputFormat(manifest: Record<string, unknown>): string {
  const frameworks = Array.isArray(manifest.frameworks)
    ? (manifest.frameworks as string[]).slice(0, 3).join('、')
    : '';
  return `根据分析框架(${frameworks})进行诊断。\n1. 发现总结\n2. 证据支撑\n3. 置信度标注（高/中/低）\n4. 建议`;
}

// ═══ File-driven loader ═══

/**
 * 从 expert/{name}/manifest.json 读取专家定义。
 *
 * 缓存: 已加载的 manifest 按 ExpertType 缓存，避免重复读盘。
 * 降级:
 *   manifest.json不存在或解析失败 → 返回最小默认定义 + log.warn + degraded
 *   字段缺失 → 使用默认值填充
 *
 * @param type - ExpertType（如 'strategic_analyst'）
 * @returns ExpertDefinition
 */
export function readExpertManifest(type: ExpertType): ExpertDefinition {
  const cached = manifestCache.get(type);
  if (cached) return cached;

  const manifestName = EXPERT_TYPE_TO_MANIFEST[type];
  if (!manifestName) {
    console.warn('[expert-prompts] 未知ExpertType:', type);
    const fallback = getDefaultDefinition(type);
    manifestCache.set(type, fallback);
    return fallback;
  }

  const manifestPath = path.join(__dirname, '..', '..', '..', '..', '..', 'expert', manifestName, 'manifest.json');

  try {
    if (!fs.existsSync(manifestPath)) {
      console.warn('[expert-prompts] manifest.json不存在:', type, manifestPath);
      const fallback = getDefaultDefinition(type);
      manifestCache.set(type, fallback);
      return fallback;
    }

    const raw = fs.readFileSync(manifestPath, 'utf-8');
    const data = JSON.parse(raw) as Record<string, unknown>;

    const def: ExpertDefinition = {
      type,
      name: (data.displayName as string) || manifestName,
      description: (data.description as string) || '',
      tone: (data.tone as string) || '',
      boundaries: Array.isArray(data.boundaries) ? (data.boundaries as string[]) : [],
      frameworks: Array.isArray(data.frameworks) ? (data.frameworks as string[]) : [],
      outputFormat: buildOutputFormat(data),
    };

    manifestCache.set(type, def);
    console.log('[expert-prompts] 专家定义已加载:', type, def.name);
    return def;
  } catch (err) {
    console.warn('[expert-prompts] manifest.json读取失败:', type, err);
    const fallback = getDefaultDefinition(type);
    manifestCache.set(type, fallback);
    return fallback;
  }
}

/**
 * 从 expert/{name}/IDENTITY.md 加载角色声明。
 * 文件不存在 → 返回空字符串。
 */
export function loadIdentityMd(type: ExpertType): string {
  const manifestName = EXPERT_TYPE_TO_MANIFEST[type];
  if (!manifestName) return '';

  const identityPath = path.join(__dirname, '..', '..', '..', '..', '..', 'expert', manifestName, 'IDENTITY.md');
  try {
    if (!fs.existsSync(identityPath)) return '';
    return fs.readFileSync(identityPath, 'utf-8');
  } catch {
    return '';
  }
}

/**
 * 从 expert/{name}/PROMPT.md 加载完整提示词模板（D58产物）。
 * 文件不存在 → 返回空字符串（调用方应回退到buildSystemPrompt）。
 */
export function loadPromptTemplate(type: ExpertType): string {
  const manifestName = EXPERT_TYPE_TO_MANIFEST[type];
  if (!manifestName) return '';

  const promptPath = path.join(__dirname, '..', '..', '..', '..', '..', 'expert', manifestName, 'PROMPT.md');
  try {
    if (!fs.existsSync(promptPath)) return '';
    return fs.readFileSync(promptPath, 'utf-8');
  } catch {
    return '';
  }
}

// ═══ Prompt Builders ═══

/** 构建系统提示——所有专家共用模板，注入角色定义 */
function buildSystemPrompt(def: ExpertDefinition, context: ExpertPromptContext): string {
  const boundaryBlock = def.boundaries.map((b, i) => `${i + 1}. ${b}`).join('\n');
  const frameworkBlock = def.frameworks.map((f, i) => `${i + 1}. ${f}`).join('\n');

  return [
    `# 角色：${def.name}`,
    '',
    `## 身份`,
    def.description,
    '',
    `## 语调`,
    def.tone,
    '',
    `## 分析框架`,
    frameworkBlock,
    '',
    `## 边界约束（绝对不可违反）`,
    boundaryBlock,
    '',
    `## 输出格式`,
    def.outputFormat,
    '',
    `## 当前上下文`,
    `- 团队 ID: ${context.teamId}`,
    `- 诊断阶段: Phase ${context.phase}`,
    `- 时间: ${new Date().toISOString()}`,
  ].join('\n');
}

/** 构建用户消息——注入证据和假设 */
function buildUserMessage(def: ExpertDefinition, context: ExpertPromptContext): string {
  const lines: string[] = [];

  // ── Evidence ──
  if (context.evidence && context.evidence.length > 0) {
    lines.push(`## 证据池（${context.evidence.length} 条，仅展示置信度 ≥ 0.5 的前 15 条）`);
    const filtered = context.evidence
      .filter(e => e.confidence >= 0.5)
      .slice(0, 15);
    if (filtered.length === 0) {
      lines.push('⚠️ 当前证据池中无高置信度条目。请在输出中显式标注"数据不足"。');
    } else {
      for (const e of filtered) {
        const dimensionTag = e.dimension ? `[${e.dimension}]` : '';
        lines.push(`- ${dimensionTag} (置信度 ${(e.confidence * 100).toFixed(0)}%) ${e.content.slice(0, 300)}`);
      }
    }
  } else {
    lines.push('⚠️ 当前无证据数据。请仅基于通用框架给出方向性建议，并在每条建议中标注"需数据验证"。');
  }

  // ── Hypotheses ──
  if (context.hypotheses && context.hypotheses.length > 0) {
    lines.push('');
    lines.push(`## 已有假设（${context.hypotheses.length} 条）`);
    for (const h of context.hypotheses.slice(0, 5)) {
      const evidenceCount = h.supportingEvidence?.length ?? 0;
      lines.push(`- [${(h.confidence * 100).toFixed(0)}%] ${h.statement.slice(0, 300)}${evidenceCount > 0 ? ` (${evidenceCount} 条支撑证据)` : ''}`);
    }
  }

  return lines.join('\n');
}

// ═══ Public API ═══

export function buildStrategicAnalystPrompt(context: ExpertPromptContext): ExpertPrompt {
  const def = readExpertManifest('strategic_analyst');
  return {
    systemPrompt: buildSystemPrompt(def, context),
    userMessage: buildUserMessage(def, context),
  };
}

export function buildOrgDiagnosticianPrompt(context: ExpertPromptContext): ExpertPrompt {
  const def = readExpertManifest('org_diagnostician');
  return {
    systemPrompt: buildSystemPrompt(def, context),
    userMessage: buildUserMessage(def, context),
  };
}

export function buildFinancialAnalystPrompt(context: ExpertPromptContext): ExpertPrompt {
  const def = readExpertManifest('financial_analyst');
  return {
    systemPrompt: buildSystemPrompt(def, context),
    userMessage: buildUserMessage(def, context),
  };
}

export function buildTechArchitectPrompt(context: ExpertPromptContext): ExpertPrompt {
  const def = readExpertManifest('tech_architect');
  return {
    systemPrompt: buildSystemPrompt(def, context),
    userMessage: buildUserMessage(def, context),
  };
}

export function buildActionAdvisorPrompt(context: ExpertPromptContext): ExpertPrompt {
  const def = readExpertManifest('action_advisor');
  return {
    systemPrompt: buildSystemPrompt(def, context),
    userMessage: buildUserMessage(def, context),
  };
}

export function buildMarketingAnalystPrompt(context: ExpertPromptContext): ExpertPrompt {
  const def = readExpertManifest('marketing_analyst');
  return {
    systemPrompt: buildSystemPrompt(def, context),
    userMessage: buildUserMessage(def, context),
  };
}

/** 按专家类型分发 */
export function buildExpertPrompt(type: ExpertType, context: ExpertPromptContext): ExpertPrompt {
  switch (type) {
    case 'strategic_analyst':   return buildStrategicAnalystPrompt(context);
    case 'org_diagnostician':   return buildOrgDiagnosticianPrompt(context);
    case 'financial_analyst':   return buildFinancialAnalystPrompt(context);
    case 'tech_architect':      return buildTechArchitectPrompt(context);
    case 'action_advisor':      return buildActionAdvisorPrompt(context);
    case 'marketing_analyst':   return buildMarketingAnalystPrompt(context);
  }
}

/** 获取所有专家定义（用于 UI 展示、Agent 注册表等） */
export function getExpertDefinition(type: ExpertType): ExpertDefinition {
  return readExpertManifest(type);
}

/** 列出所有专家类型 */
export function listExpertTypes(): ExpertType[] {
  return [
    'strategic_analyst',
    'org_diagnostician',
    'financial_analyst',
    'tech_architect',
    'action_advisor',
    'marketing_analyst',
  ];
}

/**
 * 三层 System Prompt 构建器 (Step 5a)。
 * 共享基座 → 专家差异 → 输出格式约束。
 */
export function buildExpertSystemPrompt(
  type: ExpertType,
  context: { teamId: string; phase: number; evidence: any[]; sessionBrief: any },
): string {
  const def = getExpertDefinition(type);
  if (!def) return '';

  return [
    `# 角色: ${def.name}`,
    def.description,
    '',
    `## 语调`,
    def.tone,
    '',
    `## 约束`,
    def.boundaries.map((b, i) => `${i + 1}. ${b}`).join('\n'),
    '',
    `## 框架`,
    def.frameworks.map((f, i) => `${i + 1}. ${f}`).join('\n'),
    '',
    `## 诊断上下文`,
    `组织: ${context.sessionBrief?.orgName || context.teamId}`,
    `阶段: Phase ${context.phase}`,
    `证据: ${context.evidence?.length || 0} 条`,
    '',
    `## 输出格式 (必须严格遵守)`,
    def.outputFormat || 'JSON',
    '',
    '只输出纯 JSON。不要 Markdown 代码块包裹。',
  ].join('\n');
}
