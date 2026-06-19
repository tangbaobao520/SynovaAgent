/**
 * agent-tool-registry.ts — Agent 工具注册表
 *
 * 将 22 个诊断模块 + 3 个 FDE 工具统一注册为 AgentTool，
 * 供 DiagnosisOrchestrator 在 Phase 2/5 通过 ToolExecutor 调用。
 *
 * 每个 AgentTool 携带权限级别和允许的 Phase 范围。
 * before_tool_call 钩子可在执行前拦截（权限检查、审计等）。
 */

import type { FullDiagnosisV2 } from './types';
import { DiagnosisPermissionLevel } from './types';
// [CODEX-CLEANUP] module-registry removed, DiagnosticModule type replaced with inline
import { FDE_TOOLS, type FdeToolDefinition } from './fde-toolset';
import {
  createInterviewProject,
  addInterviewee,
  getIntervieweeProfile,
  generateQuestionnaire,
  updateInterviewSession,
  distributeSurvey,
  aggregateFindings,
  getProjectProgress,
} from './interview-project-manager';
import { createLogger } from '../../infra/logger';

const log = createLogger('diagnosis/agent-tool-registry');

// ====================================================================
// Types
// ====================================================================

export interface AgentToolContext {
  teamId: string;
  phase: number;
  diagnosis?: FullDiagnosisV2;
}

export interface AgentTool {
  /** 唯一工具名（LLM function name） */
  name: string;
  /** LLM 可见的描述 */
  description: string;
  /** JSON Schema 参数定义 */
  inputSchema: Record<string, unknown>;
  /** 所需权限级别 */
  permission: DiagnosisPermissionLevel;
  /** 允许在哪些 Phase 中调用（空 = 全部） */
  allowedPhases: number[];
  /** 来源模块 ID（对应 fde-tool 名称） */
  sourceModule: string;
  /** 执行函数 */
  execute(input: Record<string, unknown>, ctx: AgentToolContext): Promise<{ content: string }>;
}

// ====================================================================
// Registry
// ====================================================================

const registry = new Map<string, AgentTool>();

export function registerTool(tool: AgentTool): void {
  registry.set(tool.name, tool);
}

export function registerTools(tools: AgentTool[]): void {
  for (const tool of tools) registry.set(tool.name, tool);
}

export function getTool(name: string): AgentTool | undefined {
  return registry.get(name);
}

export function listTools(phase?: number): AgentTool[] {
  const tools = [...registry.values()];
  if (phase !== undefined) {
    return tools.filter(t => t.allowedPhases.length === 0 || t.allowedPhases.includes(phase));
  }
  return tools;
}

export function listToolNames(phase?: number): string[] {
  return listTools(phase).map(t => t.name);
}

export function toolCount(): number {
  return registry.size;
}

export function hasTool(name: string): boolean {
  return registry.has(name);
}

/**
 * 执行指定工具。会检查工具是否存在。
 * 权限和 Phase 检查由调用方（Orchestrator）通过 before_tool_call 钩子处理。
 */
export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: AgentToolContext,
): Promise<{ content: string }> {
  const tool = registry.get(name);
  if (!tool) {
    return { content: JSON.stringify({ error: `未知工具: ${name}` }) };
  }

  try {
    return await tool.execute(input, ctx);
  } catch (err) {
    log.warn({ err, tool: name }, '[agent-tool] execution failed');
    return { content: JSON.stringify({ error: `工具执行失败: ${(err as Error).message}` }) };
  }
}

// ====================================================================
// Build tools from diagnostic modules
// ====================================================================

function moduleToTool(mod: { id: string; name?: string; description?: string; category?: string; mode?: string; priority?: string; compute?: Function }): AgentTool {
  return {
    name: `diagnose_${mod.id.replace(/-/g, '_')}`,
    description: `${mod.label}：${mod.description}（优先级 ${mod.priority}，置信度 ${mod.confidenceModel}）`,
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    permission: priorityToPermission(mod.priority),
    allowedPhases: [2], // 诊断模块在 Phase 2（假设生成）调用
    sourceModule: mod.id,
    async execute(_input, ctx) {
      const result = await runModule(ctx.teamId, mod.id);
      return {
        content: JSON.stringify({
          moduleId: result.moduleId,
          status: result.status,
          summary: result.summary,
          error: result.error,
        }),
      };
    },
  };
}

function priorityToPermission(p: string): DiagnosisPermissionLevel {
  switch (p) {
    case 'P0': return DiagnosisPermissionLevel.ADMIN_ONLY;
    case 'P1': return DiagnosisPermissionLevel.ORG_MEMBER;
    default: return DiagnosisPermissionLevel.EVERYONE;
  }
}

function fdeToolToAgentTool(fde: FdeToolDefinition): AgentTool {
  // Determine permission: push = execute, others = read
  const isWrite = fde.name === 'push_action_items';
  return {
    name: fde.name,
    description: fde.description,
    inputSchema: fde.inputSchema,
    permission: isWrite ? DiagnosisPermissionLevel.ORG_MEMBER : DiagnosisPermissionLevel.EVERYONE,
    allowedPhases: fde.name === 'push_action_items' ? [5] : [2, 5],
    sourceModule: `fde:${fde.name}`,
    async execute(input, ctx) {
      if (!ctx.diagnosis) {
        return { content: JSON.stringify({ error: '诊断数据未组装，无法执行 FDE 工具' }) };
      }
      return fde.execute(input, ctx.diagnosis, ctx.teamId);
    },
  };
}

// ====================================================================
// Auto-register all built-in tools on import
// ====================================================================

// ====================================================================
// Build interview project management tools (P2-18, 7 tools)
// ====================================================================

function buildInterviewTools(): AgentTool[] {
  return [
    {
      name: 'create_interview_project',
      description: '创建多角色访谈项目。配置调研范围、受访者人数上限、匿名规则和沟通通道。返回项目 ID 和通道推荐建议。',
      inputSchema: {
        type: 'object',
        properties: {
          teamId: { type: 'string', description: '团队 ID' },
          name: { type: 'string', description: '项目名称' },
          dimensions: { type: 'array', items: { type: 'string' }, description: '诊断维度列表' },
          depth: { type: 'string', enum: ['quick', 'standard', 'deep'], description: '调研深度' },
          maxInterviewees: { type: 'number', description: '最大受访者人数' },
          channels: { type: 'array', items: { type: 'string' }, description: '沟通通道' },
        },
        required: ['teamId', 'name'],
      },
      permission: DiagnosisPermissionLevel.ADMIN_ONLY,
      allowedPhases: [0],
      sourceModule: 'interview-project-manager',
      execute: async (input) => {
        const { project, recommendations } = createInterviewProject({
          teamId: input.teamId as string,
          name: input.name as string,
          dimensions: input.dimensions as string[] | undefined,
          depth: input.depth as 'quick' | 'standard' | 'deep' | undefined,
          maxInterviewees: input.maxInterviewees as number | undefined,
          channels: input.channels as any[] | undefined,
        });
        return { content: JSON.stringify({ project, recommendations }) };
      },
    },
    {
      name: 'add_interviewee',
      description: '向访谈项目添加受访者。自动根据角色推荐沟通通道（C-Suite→一对一，一线员工→匿名问卷）。',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: '项目 ID' },
          name: { type: 'string', description: '受访者姓名' },
          role: { type: 'string', enum: ['c_suite', 'vp_director', 'manager', 'individual', 'external'] },
          title: { type: 'string', description: '职位' },
          department: { type: 'string', description: '部门' },
          tenure: { type: 'string', description: '入职时间' },
        },
        required: ['projectId', 'name', 'role', 'title', 'department'],
      },
      permission: DiagnosisPermissionLevel.ADMIN_ONLY,
      allowedPhases: [0],
      sourceModule: 'interview-project-manager',
      execute: async (input) => {
        const person = addInterviewee(input.projectId as string, {
          projectId: input.projectId as string,
          name: input.name as string,
          role: input.role as any,
          title: input.title as string,
          department: input.department as string,
          tenure: input.tenure as string | undefined,
        });
        return { content: JSON.stringify(person ?? { error: '添加失败：项目不存在或已达人数上限' }) };
      },
    },
    {
      name: 'get_interviewee_profile',
      description: '获取受访者角色画像。包含角色权重、推荐访谈维度、隐私约束。首次调用时构建并缓存。',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: { type: 'string' },
          intervieweeId: { type: 'string' },
        },
        required: ['projectId', 'intervieweeId'],
      },
      permission: DiagnosisPermissionLevel.ORG_MEMBER,
      allowedPhases: [0, 1, 2],
      sourceModule: 'interview-project-manager',
      execute: async (input) => {
        const profile = getIntervieweeProfile(input.projectId as string, input.intervieweeId as string);
        return { content: JSON.stringify(profile ?? { error: '受访者或项目不存在' }) };
      },
    },
    {
      name: 'generate_questionnaire',
      description: '按角色和诊断领域生成定制问卷。C-Suite 聚焦战略，一线聚焦工具体验。每题标注敏感度和推荐通道。',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: { type: 'string' },
          intervieweeId: { type: 'string', description: '可选：按角色定制；不传则通用' },
          domains: { type: 'array', items: { type: 'string' } },
          questionCount: { type: 'number' },
        },
        required: ['projectId'],
      },
      permission: DiagnosisPermissionLevel.ORG_MEMBER,
      allowedPhases: [1],
      sourceModule: 'interview-project-manager',
      execute: async (input) => {
        const result = generateQuestionnaire({
          projectId: input.projectId as string,
          intervieweeId: input.intervieweeId as string | undefined,
          domains: input.domains as string[] | undefined,
          questionCount: input.questionCount as number | undefined,
        });
        return { content: JSON.stringify(result) };
      },
    },
    {
      name: 'update_interview_session',
      description: '更新受访者访谈状态（pending/in_progress/completed/skipped/declined）。自动推进项目阶段。',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: { type: 'string' },
          intervieweeId: { type: 'string' },
          status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'skipped', 'declined'] },
          notes: { type: 'string', description: '访谈备注' },
        },
        required: ['projectId', 'intervieweeId', 'status'],
      },
      permission: DiagnosisPermissionLevel.ORG_MEMBER,
      allowedPhases: [1, 2],
      sourceModule: 'interview-project-manager',
      execute: async (input) => {
        const result = updateInterviewSession({
          projectId: input.projectId as string,
          intervieweeId: input.intervieweeId as string,
          status: input.status as any,
          notes: input.notes as string | undefined,
        });
        return { content: JSON.stringify(result ?? { error: '项目或受访者不存在' }) };
      },
    },
    {
      name: 'distribute_survey',
      description: '向项目中配置了匿名问卷通道的受访者发放问卷。自动生成匿名链接，遵守聚合阈值规则。',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: { type: 'string' },
          baseUrl: { type: 'string', description: '问卷服务基 URL' },
        },
        required: ['projectId'],
      },
      permission: DiagnosisPermissionLevel.ADMIN_ONLY,
      allowedPhases: [1],
      sourceModule: 'interview-project-manager',
      execute: async (input) => {
        const result = distributeSurvey(input.projectId as string, input.baseUrl as string | undefined);
        return { content: JSON.stringify(result ?? { error: '项目不存在' }) };
      },
    },
    {
      name: 'aggregate_findings',
      description: '按角色权重聚合所有已完成受访者的发现。含加权评分、角色贡献度、矛盾信号、代表性引用。',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: { type: 'string' },
          dimensions: { type: 'array', items: { type: 'string' } },
          roleWeights: { type: 'object', description: '自定义角色权重映射' },
          minConfidence: { type: 'number', description: '最低置信度阈值' },
        },
        required: ['projectId'],
      },
      permission: DiagnosisPermissionLevel.ORG_MEMBER,
      allowedPhases: [3],
      sourceModule: 'interview-project-manager',
      execute: async (input) => {
        const findings = aggregateFindings({
          projectId: input.projectId as string,
          dimensions: input.dimensions as string[] | undefined,
          roleWeights: input.roleWeights as any,
          minConfidence: input.minConfidence as number | undefined,
        });
        return { content: JSON.stringify(findings) };
      },
    },
    {
      name: 'get_project_progress',
      description: '查询访谈项目进度：受访者完成率、问卷回收率、数据完整度、下一步推荐操作。',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: { type: 'string' },
        },
        required: ['projectId'],
      },
      permission: DiagnosisPermissionLevel.EVERYONE,
      allowedPhases: [0, 1, 2, 3],
      sourceModule: 'interview-project-manager',
      execute: async (input) => {
        const progress = getProjectProgress(input.projectId as string);
        return { content: JSON.stringify(progress ?? { error: '项目不存在' }) };
      },
    },
  ];
}

// ====================================================================
// Auto-register all built-in tools on import
// ====================================================================

function registerBuiltinTools(): void {
  // 1. Register diagnostic module tools (22 modules)
  const modules = listModules();
  for (const mod of modules) {
    registerTool(moduleToTool(mod));
  }

  // 2. Register FDE tools (3 tools)
  for (const fde of FDE_TOOLS) {
    registerTool(fdeToolToAgentTool(fde));
  }

  // 3. Register interview project management tools (8 tools, P2-18)
  for (const tool of buildInterviewTools()) {
    registerTool(tool);
  }

  log.debug(`[agent-tool] registered ${registry.size} tools`);
}

registerBuiltinTools();
