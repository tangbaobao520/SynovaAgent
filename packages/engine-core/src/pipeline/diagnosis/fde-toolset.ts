/**
 * fde-toolset.ts — FDE 模块 Agent 工具集
 *
 * 将 auto-interpreter、auto-action、task-integration 三个 FDE 模块
 * 包装为 Agent 工具，供 DiagnosisOrchestrator 的 ToolExecutor 在
 * Phase 2（假设生成）和 Phase 5（交付）阶段调用。
 *
 * 每个工具定义为：
 *   - name:       工具名（ToolExecutor 路由键）
 *   - description: LLM 可见的工具描述（用于 tool selection）
 *   - inputSchema: JSON Schema 参数定义
 *   - execute:     执行函数，接收 parsed input + 团队上下文
 *
 * 设计原则：
 *   1. 工具独立失败——单个工具异常不影响其他工具或编排器主循环
 *   2. 接受预组装诊断——避免重复 assemble，由编排器在 Phase 1 后传入
 *   3. 与 ToolExecutor 接口兼容——execute() 返回 { content: string }
 */

import type { FullDiagnosisV2, MultiRoleNarrative, TaskIntegrationResult, ImprovementActionItem } from './types';
import { createLogger } from '../../infra/logger';

const log = createLogger('engine-server/pipeline/diagnosis/fde-toolset');

// ====================================================================
// 工具定义
// ====================================================================

/** 单个工具定义 */
export interface FdeToolDefinition {
  name: string;
  description: string;
  /** JSON Schema — 参数声明，供 LLM 理解工具入参 */
  inputSchema: Record<string, unknown>;
  /**
   * 执行工具。
   * @param input 已从 JSON 解析的参数对象
   * @param diagnosis 预组装的诊断数据（Phase 1 产出）
   * @param teamId 团队 ID
   */
  execute(
    input: Record<string, unknown>,
    diagnosis: FullDiagnosisV2,
    teamId: string,
  ): Promise<{ content: string }>;
}

// ====================================================================
// Tool 1: auto-interpreter — 多角色解读
// ====================================================================

// [CODEX-CLEANUP] autoInterpreterTool removed - auto-interpreter module deleted
const autoInterpreterTool: FdeToolDefinition = {
  name: 'generate_multi_role_narrative',
  description: '[REMOVED]',
  inputSchema: { type: 'object', properties: {} },
  async execute() { throw new Error('auto-interpreter removed'); },
};

// ====================================================================
// Tool 2: auto-action — 行动方案生成
// ====================================================================

// [CODEX-CLEANUP] autoActionTool removed - auto-action module deleted
const autoActionTool: FdeToolDefinition = {
  name: 'generate_action_plan',
  description: '[REMOVED]',
  inputSchema: { type: 'object', properties: {} },
  async execute() { throw new Error('auto-action removed'); },
};

// ====================================================================
// Tool 3: task-integration — 推送到外部任务系统
// ====================================================================

const taskIntegrationTool: FdeToolDefinition = {
  name: 'push_action_items',
  description: `将行动方案中的选定项 push 到外部任务管理系统（Jira REST API / Linear GraphQL API）。
支持幂等创建（先查后建，避免重复）。
仅处理 targetSystem !== 'manual' 的项；manual 项自动跳过。
调用时机：Phase 5（交付阶段，在用户确认行动方案后执行推送）。`,
  inputSchema: {
    type: 'object',
    properties: {
      actionItems: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            suggestion: { type: 'string' },
            priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
            targetSystem: { type: 'string', enum: ['jira', 'linear', 'manual'] },
            sourceModule: { type: 'string' },
            sourceDimension: { type: 'string' },
            estimatedEffortHours: { type: 'number' },
          },
          required: ['title', 'priority', 'targetSystem'],
        },
        description: '要推送的行动项列表。通常来自 generate_action_plan 的输出。',
      },
      /** 限制只推送特定系统 */
      targetSystems: {
        type: 'array',
        items: { type: 'string', enum: ['jira', 'linear'] },
        description: '限制只推送到指定的系统。空数组或省略 = 全部。',
      },
    },
    required: ['actionItems'],
  },
  async execute(input, _diagnosis, teamId) {
    const { pushActionItems } = await import('./task-integration');

    const rawItems = input.actionItems as Array<Record<string, unknown>>;
    const now = new Date().toISOString();

    // 从原始对象重建 ImprovementActionItem 数组
    const items: ImprovementActionItem[] = rawItems.map(item => ({
      id: (item.id as string) || `tool-${Date.now()}-${Math.random() /* nosec: nonce for ID uniqueness */.toString(36).slice(2, 7)}`,
      sourceModule: (item.sourceModule as string) || 'fde-tool',
      sourceDimension: (item.sourceDimension as string) || 'unknown',
      title: (item.title as string) || '未命名行动',
      description: (item.description as string) || '',
      targetSystem: (item.targetSystem as ImprovementActionItem['targetSystem']) || 'manual',
      priority: (item.priority as ImprovementActionItem['priority']) || 'medium',
      estimatedEffortHours: (item.estimatedEffortHours as number) || 4,
      createdAt: now,
      status: 'pending' as const,
      suggestion: (item.suggestion as string) || '',
    }));

    // 按 targetSystems 过滤
    const targetFilter = input.targetSystems as string[] | undefined;
    const filtered = targetFilter?.length
      ? items.filter(i => targetFilter.includes(i.targetSystem))
      : items;

    log.debug(`[fde-toolset] pushing ${filtered.length} items (${items.length - filtered.length} filtered out)`);

    const result = await pushActionItems(teamId, filtered);

    return {
      content: JSON.stringify({
        created: result.created,
        failed: result.failed,
        skipped: result.skipped,
        summary: `已创建 ${result.created.length} 个任务，失败 ${result.failed.length}，跳过 ${result.skipped.length}`,
      }),
    };
  },
};

// ====================================================================
// 工具注册表
// ====================================================================

/** 所有 FDE 工具列表 */
export const FDE_TOOLS: FdeToolDefinition[] = [
  autoInterpreterTool,
  autoActionTool,
  taskIntegrationTool,
];

/** 按名称查找工具 */
export function getFdeTool(name: string): FdeToolDefinition | undefined {
  return FDE_TOOLS.find(t => t.name === name);
}

/**
 * 创建 FDE 工具执行器，兼容 DiagnosisOrchestrator 的 ToolExecutor 接口。
 *
 * Usage:
 *   const executor = createFdeToolExecutor(diagnosis, teamId);
 *   const result = await executor.execute('generate_action_plan', '{"minPriority":"high"}');
 */
export function createFdeToolExecutor(
  diagnosis: FullDiagnosisV2,
  teamId: string,
): { execute(toolName: string, input: string): Promise<{ content: string }> } {
  return {
    async execute(toolName: string, input: string): Promise<{ content: string }> {
      const tool = getFdeTool(toolName);
      if (!tool) {
        log.warn(`[fde-toolset] unknown tool requested: ${toolName}`);
        return { content: JSON.stringify({ error: `未知工具: ${toolName}`, availableTools: FDE_TOOLS.map(t => t.name) }) };
      }

      let parsedInput: Record<string, unknown>;
      try {
        parsedInput = JSON.parse(input || '{}');
      } catch {
        log.warn(`[fde-toolset] failed to parse tool input for ${toolName}`);
        return { content: JSON.stringify({ error: '工具输入 JSON 解析失败' }) };
      }

      try {
        log.debug(`[fde-toolset] executing tool: ${toolName}`);
        const result = await tool.execute(parsedInput, diagnosis, teamId);
        return result;
      } catch (err) {
        log.warn({ err, tool: toolName }, '[fde-toolset] tool execution failed');
        return { content: JSON.stringify({ error: `${toolName} 执行失败: ${(err as Error).message}` }) };
      }
    },
  };
}

/** 列出所有可用工具名及描述（供 LLM system prompt 使用） */
export function listFdeToolDescriptions(): string {
  return FDE_TOOLS.map(t =>
    `- **${t.name}**: ${t.description.replace(/\n/g, ' ').slice(0, 200)}`,
  ).join('\n');
}
