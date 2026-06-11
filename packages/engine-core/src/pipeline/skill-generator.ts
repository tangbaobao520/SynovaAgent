/**
 * skill-generator.ts — 路径三：LLM 从零生成技能（BP 壁垒六飞轮闭环）
 *
 * 当千面市场（路径一）和框架映射（路径二）都无法满足技能需求时，
 * 引擎调用 LLM 从零生成完整 SkillCard，经安全审计后回写注册表。
 *
 * 用法：
 *   - Pipeline: Phase D 检测到技能缺口时自动调用
 *   - On-demand: 用户通过 API 请求长尾技能生成
 */

import type { SkillCard } from '../types';
import { chat } from '../llm-client';
import { extractJSON } from './llm-json-repair';
import { getEngineContext } from '../engine-context';
import { createLogger } from '../infra/logger';

const log = createLogger('engine-server/pipeline/skill-generator');

// ================================================================
// 类型
// ================================================================

export interface SkillGenRequest {
  /** 技能名称 */
  name: string;
  /** 为什么需要这个技能（一句话描述） */
  purpose: string;
  /** 角色上下文（谁会用这个技能） */
  roleContext?: {
    roleName: string;
    responsibilities: string[];
    governanceLayer: string;
  };
  /** 任务上下文 */
  taskContext?: {
    job: string;
    constraints: string[];
    collaborationMode?: string;
  };
  /** 语言 */
  locale?: string;
}

export interface SkillGenResult {
  skill: SkillCard;
  generated: boolean;
  securityScore: number | null;
  sourceTier: 'speculative';
}

// ================================================================
// System Prompt
// ================================================================

function buildGenSystemPrompt(locale: string): string {
  return `你是一位技能设计专家。用户需要一个 AI 团队中还不存在的技能，你需要从零设计一个完整的、可执行的技能规格。

输出必须是严格 JSON，格式如下：
{
  "name": "技能名称（与请求一致）",
  "summary": "一句话概述（30字以内）",
  "description": "详细说明（2-4句），包括这个技能解决什么问题、适用于什么场景",
  "category": "分类：数据分析 | 内容创作 | 开发工具 | 营销推广 | 合规管理 | 市场情报 | 沟通协调 | 运营执行 | 组织设计 | 战略规划",
  "tags": ["标签1", "标签2", "标签3"],
  "scenarios": ["使用场景1（描述什么情况下触发此技能）", "使用场景2", "使用场景3"],
  "steps": ["执行步骤1（具体可执行的动作）", "执行步骤2", "执行步骤3", "执行步骤4"],
  "prerequisites": ["使用前需具备的信息或前置条件"],
  "failureModes": ["常见失败方式1", "常见失败方式2"],
  "dependsOn": [],
  "conflictsWith": [],
  "triggers": ["触发此技能的条件"],
  "strategicLink": "此技能服务的战略目标",
  "version": "1.0.0",
  "sourceTier": "speculative",
  "installCommand": "安装指令 — npm/pip/apt-get/manual: 之一",
  "allowedTools": ["此技能需要的工具权限"]
}

设计原则：
1. name 必须与用户请求一致
2. steps 是核心 — 每个步骤必须是具体可执行的动作，至少3步
3. scenarios 描述真实使用场景，不是抽象概念
4. prerequisites 列出使用该技能前必须知道的信息
5. failureModes 列出此技能最常见的失败方式（帮助Agent自我纠错）
6. category 从给定列表中选择最匹配的
7. tags 3-5个，帮助技能在市场中被搜索到
8. installCommand 必须具体 — pip install xxx / npm install xxx / manual: 具体操作
9. version 固定为 "1.0.0"（首次生成）

语言：${locale}`;
}

function buildGenUserPrompt(req: SkillGenRequest): string {
  const parts: string[] = [`请为以下需求从零设计一个新技能：`];
  parts.push(`技能名称：${req.name}`);
  parts.push(`使用目的：${req.purpose}`);

  if (req.roleContext) {
    parts.push(`\n使用者角色：${req.roleContext.roleName}（${req.roleContext.governanceLayer}）`);
    parts.push(`角色职责：${req.roleContext.responsibilities.join('、')}`);
  }

  if (req.taskContext) {
    parts.push(`\n团队任务：${req.taskContext.job}`);
    if (req.taskContext.constraints.length > 0) {
      parts.push(`任务约束：${req.taskContext.constraints.join('；')}`);
    }
    if (req.taskContext.collaborationMode) {
      parts.push(`协作模式：${req.taskContext.collaborationMode}`);
    }
  }

  parts.push(`\n只输出 JSON，不要其他内容。`);
  return parts.join('\n');
}

// ================================================================
// 验证
// ================================================================

function validateGeneratedSkill(skill: Partial<SkillCard>): string | null {
  if (!skill.name || skill.name.trim().length === 0) return 'name 为空';
  if (!skill.summary || skill.summary.trim().length === 0) return 'summary 为空';
  if (!skill.description || skill.description.trim().length < 10) return 'description 过短';
  if (!Array.isArray(skill.steps) || skill.steps.length < 2) return 'steps 不足（需 >= 2）';
  if (!Array.isArray(skill.scenarios) || skill.scenarios.length === 0) return 'scenarios 为空';
  if (!skill.category || skill.category.trim().length === 0) return 'category 为空';
  return null;
}

function sanitizeInstallCommand(cmd: string | undefined): string {
  if (!cmd || cmd.trim().length === 0) return 'manual: 根据技能文档手动配置';
  const clean = cmd.trim();
  const placeholders = /^(可安装|\[可安装\]|需手动安装|手动安装|待定|TBD|TODO|N\/A|无|暂无|placeholder)$/i;
  if (placeholders.test(clean)) return 'manual: 根据技能文档手动配置';
  if (!/^(npm |pip |apt-get |manual:)/i.test(clean)) return `manual: ${clean}`;
  return clean;
}

// ================================================================
// 主入口
// ================================================================

/**
 * 从零生成一个技能（路径三：LLM 自动生成）。
 *
 * 流程：
 *   1. LLM 生成完整 SkillCard JSON
 *   2. JSON 提取 + 结构验证
 *   3. 安全审计（auditSkillContent）
 *   4. 返回 SkillCard（由调用方决定是否写入注册表）
 *
 * @returns SkillGenResult — 包含生成的 SkillCard 和安全评分
 */
export async function generateSkillFromScratch(
  req: SkillGenRequest,
  abortSignal?: AbortSignal,
): Promise<SkillGenResult> {
  const locale = req.locale || 'zh-CN';
  const systemPrompt = buildGenSystemPrompt(locale);
  const userPrompt = buildGenUserPrompt(req);

  // Step 1: LLM 生成
  const result = await chat({
    systemPrompt,
    userMessage: userPrompt,
    abortSignal,
    temperature: 0.7,
    maxTokens: 2000,
  });

  // Step 2: JSON 提取
  let parsed: any;
  try {
    const jsonStr = extractJSON(result.content);
    parsed = JSON.parse(jsonStr);
  } catch {
    log.debug('[skill-generator] JSON extraction failed, trying direct parse');
    // 降级：直接解析（LLM 有时直接输出纯 JSON）
    try {
      parsed = JSON.parse(result.content.trim());
    } catch {
      log.warn('[skill-generator] LLM skill generation failed: unable to parse JSON response');
      throw new Error(`LLM 技能生成失败：无法解析 JSON 响应（前100字符: ${result.content.slice(0, 100)}）`);
    }
  }

  // Step 3: 验证
  const validationErr = validateGeneratedSkill(parsed);
  if (validationErr) {
    throw new Error(`生成的技能验证失败: ${validationErr}`);
  }

  // Step 4: 构造 SkillCard
  const skillId = `gen-${req.name.toLowerCase().replace(/[^\w]/g, '-').replace(/-+/g, '-').slice(0, 48)}`;
  const installCmd = sanitizeInstallCommand(parsed.installCommand);

  const skill: SkillCard = {
    id: skillId,
    name: req.name,
    summary: parsed.summary,
    description: parsed.description,
    scenarios: parsed.scenarios || [],
    steps: parsed.steps || [],
    tags: parsed.tags || [],
    category: parsed.category || '运营执行',
    version: parsed.version || '1.0.0',
    securityScore: null, // 待审计
    installCommand: installCmd,
    sourceFramework: 'llm-generated',
    isMarketplaceSkill: false, // 需审计通过后标记
    prerequisites: parsed.prerequisites || [],
    failureModes: parsed.failureModes || [],
    sourceTier: 'speculative',
    dependsOn: parsed.dependsOn || [],
    conflictsWith: parsed.conflictsWith || [],
    triggers: parsed.triggers || [],
    strategicLink: parsed.strategicLink || '',
    geneSources: [],
    approvalRequired: [],
  };

  // Step 5: 安全审计
  let securityScore: number | null = null;
  try {
    const auditText = [
      `# ${skill.name}`,
      skill.summary,
      skill.description,
      ...skill.steps,
      ...skill.tags,
      ...(skill.prerequisites || []),
      ...(skill.failureModes || []),
      skill.installCommand || '',
    ].join('\n');
    const auditResult = getEngineContext().securityAudit.auditSkillContent(skill.name, auditText);
    securityScore = auditResult?.score ?? null;
    skill.securityScore = securityScore;
  } catch (_e) { log.debug('技能安全审计跳过: %s', String(_e)); }

  return { skill, generated: true, securityScore, sourceTier: 'speculative' };
}

/**
 * 批量生成 — 从技能缺口列表一次 LLM 调用生成多个技能。
 * 用于 Phase D 管线中的自动缺口填充。
 */
export async function generateSkillsBatch(
  requests: SkillGenRequest[],
  abortSignal?: AbortSignal,
): Promise<SkillGenResult[]> {
  if (requests.length === 0) return [];

  const results: SkillGenResult[] = [];

  // 逐个生成（LLM 稳定性优先于速度）
  for (const req of requests) {
    try {
      const result = await generateSkillFromScratch(req, abortSignal);
      results.push(result);
    } catch (err) {
      log.warn(`[skill-generator] 生成 "${req.name}" 失败: ${(err as Error).message}`);
      // 继续生成其他技能，一个失败不影响其余
    }
  }

  return results;
}
