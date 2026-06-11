/**
 * engine-server/pipeline/feasibility-check.ts — 可行性预检查
 *
 * Ginkgo EstiMate 框架：在进入昂贵管道阶段前，通过一次 LLM 调用评估任务可行性。
 * 不阻塞管道——即使不可行也继续执行（附带警告）。
 *
 * @packageDocumentation
 */

import type { TaskDefinitionDTO } from '../types';
import { chat } from '../llm-client';
import { extractJSON } from './llm-json-repair';
import { createLogger } from '../infra/logger';

const log = createLogger('engine-server/pipeline/feasibility-check');

export type FeasibilityStatus = 'feasible' | 'conditional' | 'infeasible';

export interface FeasibilityResult {
  status: FeasibilityStatus;
  bottleneck?: string;       // 主要瓶颈/约束
  warnings?: string[];       // 风险警告
  suggestions?: string[];    // 改进建议（conditional/infeasible 时）
}

/**
 * 可行性预检查——一次 LLM 调用，评估 TaskDefinition 是否可行。
 *
 * @param taskDef - 任务定义
 * @param abortSignal - 可选取消信号
 * @returns FeasibilityResult（LLM 不可用时降级为 conditional）
 */
export async function assessFeasibility(
  taskDef: TaskDefinitionDTO,
  abortSignal?: AbortSignal,
): Promise<FeasibilityResult> {
  try {
    const constraints = Array.isArray(taskDef.constraints) ? taskDef.constraints : [];
    const metrics = Array.isArray(taskDef.successMetrics) ? taskDef.successMetrics : [];
    const failures = Array.isArray(taskDef.failureModes) ? taskDef.failureModes : [];

    const prompt = `评估以下团队设计任务是否可行。三档判定：
- feasible: 任务可以在合理团队结构下执行
- conditional: 任务可行但有一个瓶颈约束
- infeasible: 指定条件下无法执行

任务描述：${taskDef.job}
约束条件：${constraints.join('；') || '无'}
团队规模/阶段：${taskDef.stage}
成功标准：${metrics.join('；') || '无'}
失败模式：${failures.join('；') || '无'}
置信度：${taskDef.confidence}

请只返回JSON: {"status":"feasible|conditional|infeasible","bottleneck":"主要瓶颈/约束描述","warnings":["风险警告1","风险警告2"],"suggestions":["改进建议1","改进建议2"]}`;

    const result = await chat({
      systemPrompt: '你是一个团队设计可行性评估专家。请严格按JSON格式输出，不要包含其他内容。',
      userMessage: prompt,
      abortSignal,
      temperature: 0.3,
      maxTokens: 1000,
    });

    const jsonStr = extractJSON(result.content);
    const parsed = JSON.parse(jsonStr);

    return {
      status: parsed.status || 'conditional',
      bottleneck: parsed.bottleneck,
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : undefined,
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : undefined,
    };
  } catch (err) {
    log.warn(`[feasibility-check] LLM 不可用，降级为 conditional: ${(err as Error).message}`);
    return {
      status: 'conditional',
      bottleneck: '无法验证可行性（LLM不可用）',
    };
  }
}
