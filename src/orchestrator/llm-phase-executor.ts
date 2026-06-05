/**
 * orchestrator/llm-phase-executor.ts — LLMPhaseExecutor (runTurn 降级版) (Iter 4)
 *
 * 对标 Claw-Code run_turn() — LLM 对话 + 工具调用循环。
 * 但降级为 Phase 执行器, 仅在 Phase 2 (假设生成) 和 Phase 5 (交付) 被调用。
 *
 * 不是主循环。诊断主循环是六阶段状态机。
 */
import type { LLMClient, ToolExecutor } from './diagnosis-orchestrator';
import { HookRunner } from './hook-runner';
import type { LLMMessage } from '../providers/types';
import { createLogger } from '../logger';

const log = createLogger('orchestrator/llm-phase-executor');

// ═══ Types ═══

export interface LLMPhaseConfig {
  maxRounds: number;
  systemPrompt: string;
  temperature?: number;
  maxTokens?: number;
}

export interface TurnResult {
  reply: string;
  toolCallCount: number;
  errors: string[];
  roundsTaken: number;
}

// ═══ LLMPhaseExecutor ═══

export class LLMPhaseExecutor {
  private llmClient: LLMClient;
  private toolExecutor: ToolExecutor;
  private hookRunner: HookRunner;
  private config: LLMPhaseConfig;

  constructor(
    llmClient: LLMClient,
    toolExecutor: ToolExecutor,
    config: Partial<LLMPhaseConfig> = {},
  ) {
    this.llmClient = llmClient;
    this.toolExecutor = toolExecutor;
    this.hookRunner = new HookRunner();
    this.config = {
      maxRounds: config.maxRounds ?? 3,
      systemPrompt: config.systemPrompt ?? '',
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    };
  }

  getHookRunner(): HookRunner { return this.hookRunner; }

  /**
   * Run a full turn: LLM consult → tool execution loop → final reply.
   * Returns only when tool loop completes or maxRounds exceeded.
   *
   * This is NOT the main orchestration loop — it's only called in Phase 2 and 5.
   */
  async executeTurn(messages: LLMMessage[]): Promise<TurnResult> {
    const errors: string[] = [];
    let toolCallCount = 0;
    let roundsTaken = 0;

    // Insert system prompt if not already present
    if (this.config.systemPrompt && !messages.some(m => m.role === 'system')) {
      messages.unshift({ role: 'system', content: this.config.systemPrompt });
    }

    for (let round = 0; round < this.config.maxRounds; round++) {
      roundsTaken = round + 1;

      try {
        // Single LLM call with tool definitions
        const response = await this.llmClient.consult(
          this.config.systemPrompt,
          messages.filter(m => m.role !== 'system').map(m => m.content).join('\n'),
          { temperature: this.config.temperature, maxTokens: this.config.maxTokens },
        );

        const content = response.content || '';

        // Check for tool calls (LLM response contains tool call markers)
        const toolCalls = this.parseToolCalls(content);

        if (toolCalls.length === 0) {
          // No tools → return final reply
          return { reply: content, toolCallCount, errors, roundsTaken };
        }

        // Execute each tool call
        messages.push({ role: 'assistant', content });

        for (const tc of toolCalls) {
          toolCallCount++;

          // PreToolUse hooks
          const preResult = await this.hookRunner.runPreToolUse({
            name: tc.name, input: JSON.stringify(tc.arguments),
          });

          if (preResult.action === 'deny') {
            messages.push({
              role: 'tool',
              content: `Tool "${tc.name}" denied: ${preResult.reason}`,
            });
            continue;
          }

          const toolInput = preResult.modifiedInput || JSON.stringify(tc.arguments);

          try {
            const result = await this.toolExecutor.execute(tc.name, toolInput);

            // PostToolUse hooks
            await this.hookRunner.runPostToolUse(
              { name: tc.name, input: toolInput },
              { content: result.content, isError: result.isError },
            );

            messages.push({
              role: 'tool',
              content: result.content,
            });
          } catch (err: any) {
            errors.push(`${tc.name}: ${err.message}`);
            log.warn({ err, tool: tc.name }, '工具执行失败');

            // Failure hooks
            await this.hookRunner.runPostToolUseFailure(
              { name: tc.name, input: toolInput },
              err,
            );

            messages.push({
              role: 'tool',
              content: JSON.stringify({ error: err.message }),
            });
          }
        }

        // Continue loop — LLM processes tool results
        continue;
      } catch (err: any) {
        errors.push(`LLM call failed: ${err.message}`);
        log.error({ err, round }, 'LLM 调用失败');
        return { reply: `抱歉, 调用失败: ${err.message}`, toolCallCount, errors, roundsTaken };
      }
    }

    // Max rounds exceeded — do final call without tools
    try {
      const final = await this.llmClient.consult(
        this.config.systemPrompt,
        messages.filter(m => m.role !== 'system').map(m => m.content).join('\n'),
      );
      return { reply: final.content || '工具调用超过最大轮次', toolCallCount, errors, roundsTaken };
    } catch (err: any) {
      return { reply: `工具调用超过最大轮次: ${err.message}`, toolCallCount, errors, roundsTaken };
    }
  }

  /** Parse tool calls from LLM response (simplified — full version uses structured output) */
  private parseToolCalls(content: string): Array<{ name: string; arguments: Record<string, unknown> }> {
    const calls: Array<{ name: string; arguments: Record<string, unknown> }> = [];

    // Try JSON structured output
    try {
      const match = content.match(/\[工具调用:\s*([\s\S]*?)\s*\]/);
      if (match) {
        const toolsText = match[1].trim();
        const toolNames = toolsText.split(/\s+/).filter(Boolean);
        for (const name of toolNames) {
          calls.push({ name, arguments: {} });
        }
        return calls;
      }
    } catch { log.debug('Phase LLM 响应解析失败 — 继续'); }

    // Try standard JSON format
    try {
      const parsed = JSON.parse(content);
      if (parsed.tool_calls || parsed.toolCalls) {
        return parsed.tool_calls || parsed.toolCalls || [];
      }
    } catch { log.debug('LLM 响应非 JSON — 使用原始文本'); }

    return calls;
  }
}
