/**
 * agent/tool-loop-executor.ts — LLM + Tool 执行循环 (ConversationEngine 子组件)
 *
 * 从 ConversationEngine (915 行) 中提取的第 1 个子组件。
 * 职责: callLLMWithTools() + streamWithToolLoop() (~200 行)
 *
 * Iron law #32: 错误统一通过 try/catch + log 处理。
 * Iron law #31: degraded 信号传播——工具失败不阻断对话。
 */
import type { LLMMessage } from '../providers/types';
import type { EngineContext } from './engine-context';
import { createLogger } from '../logger';
import { ToolGuardrails } from './tools';
import * as crypto from 'crypto';

/** Tool execution result — may contain error property on failure */
interface ToolExecResult {
  error?: string;
  [key: string]: unknown;
}

export class ToolLoopExecutor {
  private ctx: EngineContext;
  private log = createLogger('agent/tool-loop');
  private guardrails = new ToolGuardrails();

  constructor(ctx: EngineContext) {
    this.ctx = ctx;
  }

  /**
   * Call LLM with tool execution loop (non-streaming).
   * Max 3 rounds of tool calls to prevent infinite loops.
   */
  async callLLMWithTools(): Promise<string> {
    const MAX_TOOL_ROUNDS = 3;
    const tools = this.ctx.toolRegistry.listTools();
    const { provider, messages, hookRunner, eventBus, sessionId, toolRegistry } = this.ctx;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      try {
        const result = await provider.chat(messages, {
          tools: tools.length > 0 ? toolRegistry.toOpenAITools() : undefined,
        });

        // 无工具调用 → 直接返回
        if (!result.toolCalls || result.toolCalls.length === 0) {
          return result.content || '(empty response)';
        }

        // 有工具调用 → 执行并注入结果
        this.log.info({ count: result.toolCalls.length, round }, 'LLM 请求工具调用');

        messages.push({
          role: 'assistant',
          content: result.content || '',
        } as LLMMessage);

        for (const tc of result.toolCalls) {
          let params: Record<string, unknown> = {};
          try {
            params = JSON.parse(tc.function.arguments);
          } catch {
            this.log.debug({ name: tc.function.name, args: tc.function.arguments.slice(0, 100) },
              'JSON.parse 失败于工具参数，使用空对象');
            params = {};
          }

          // 编排层 Hook: pre-tool-use (权限/脱敏)
          let effectiveParams = params;
          if (hookRunner) {
            const preResult = await hookRunner.runPreToolUse({
              name: tc.function.name, input: JSON.stringify(params),
            });
            if (preResult.action === 'deny') {
              messages.push({
                role: 'tool', tool_call_id: crypto.randomUUID(),
                content: JSON.stringify({ error: `工具被拒绝: ${preResult.reason}` }),
              });
              eventBus?.emit({
                id: `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
                type: 'tool.denied', consultationId: sessionId,
                data: { toolName: tc.function.name, reason: preResult.reason },
                traceId: sessionId, spanId: sessionId.slice(0, 16),
                timestamp: new Date().toISOString(),
              });
              continue; // Skip this tool, continue next
            }
            if (preResult.action === 'modify' && preResult.modifiedInput) {
              try { effectiveParams = JSON.parse(preResult.modifiedInput); } catch { /* JSON parse failed — keep original params, non-critical */ }
            }
          }

          // Hermes P4 接线: 循环保护 — 检查是否为死循环
          const guardResult = this.guardrails.check(tc.function.name, effectiveParams, {});
          if (guardResult.action === 'block') {
            this.log.warn({ tool: tc.function.name, reason: guardResult.reason }, '工具被循环保护阻止');
            messages.push({ role: 'tool', tool_call_id: crypto.randomUUID(), content: JSON.stringify({ error: `工具被阻止: ${guardResult.reason}` }) });
            continue;
          }
          if (guardResult.action === 'warn') {
            this.log.warn({ tool: tc.function.name, reason: guardResult.reason }, '工具循环警告');
          }

          const execResult = await toolRegistry.execute(tc.function.name, effectiveParams);

          // 编排层 Hook: post-tool-use (审计/证据)
          if (hookRunner) {
            await hookRunner.runPostToolUse(
              { name: tc.function.name, input: JSON.stringify(effectiveParams) },
              { content: JSON.stringify(execResult), isError: !!(execResult as ToolExecResult).error },
            );
            eventBus?.emit({
              id: `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
              type: 'tool.executed', consultationId: sessionId,
              data: { toolName: tc.function.name, success: !(execResult as ToolExecResult).error },
              traceId: sessionId, spanId: sessionId.slice(0, 16),
              timestamp: new Date().toISOString(),
            });
          }

          messages.push({
            role: 'tool',
            tool_call_id: crypto.randomUUID(),
            content: JSON.stringify(execResult),
          });
        }

        continue; // 下一轮 LLM 调用
      } catch (err: any) {
        this.log.error({ err, round }, 'LLM 调用失败');
        return `抱歉，调用失败：${err.message}`;
      }
    }

    // 达到最大轮次 → 最后一次无工具调用
    try {
      const final = await provider.chat(messages);
      return final.content || '(no response)';
    } catch (err: any) {
      this.log.error({ err }, 'callLLMWithTools: 最终轮 LLM 调用失败');
      return `工具调用超过最大轮次: ${err.message}`;
    }
  }

  /**
   * Call LLM with streaming token output + tool execution loop.
   *
   * Slice 0.1 fix: single provider.chat() call per round —
   * no more separate stream()+chat() double calls.
   */
  async streamWithToolLoop(onToken: (token: string) => void): Promise<string> {
    const MAX_ROUNDS = 3;
    const tools = this.ctx.toolRegistry.listTools();
    const { provider, messages, toolRegistry, hookRunner, eventBus, sessionId } = this.ctx;

    for (let round = 0; round < MAX_ROUNDS; round++) {
      try {
        const result = await provider.chat(messages, {
          tools: tools.length > 0 ? toolRegistry.toOpenAITools() : undefined,
        });

        const content = result.content || '';

        // 无工具调用 → 流式输出文本 + 返回
        if (!result.toolCalls || result.toolCalls.length === 0) {
          for (const ch of content) {
            onToken(ch);
          }
          messages.push({ role: 'assistant', content });
          return content || '(empty response)';
        }

        // 有工具调用
        this.log.debug({ count: result.toolCalls.length, round }, 'streamWithToolLoop: 工具调用');

        for (const ch of content) {
          onToken(ch);
        }

        messages.push({
          role: 'assistant',
          content,
          tool_calls: result.toolCalls,
        });

        onToken('\n[工具调用: ');
        for (const tc of result.toolCalls) {
          onToken(tc.function.name + ' ');
          let params: Record<string, unknown> = {};
          try {
            params = JSON.parse(tc.function.arguments);
          } catch {
            this.log.debug({ name: tc.function.name, args: tc.function.arguments.slice(0, 100) },
              'JSON.parse 失败于工具参数，使用空对象');
            params = {};
          }

          // T1.3: stream 路径也执行 hook (权限检查)
          let effectiveParams = params;
          if (hookRunner) {
            const preResult = await hookRunner.runPreToolUse({ name: tc.function.name, input: JSON.stringify(params) });
            if (preResult.action === 'deny') {
              messages.push({ role: 'tool', tool_call_id: crypto.randomUUID(), content: JSON.stringify({ error: `工具被拒绝: ${preResult.reason}` }) });
              eventBus?.emit({ id: `evt_${Date.now().toString(36)}`, type: 'tool.denied', consultationId: sessionId, data: { toolName: tc.function.name, reason: preResult.reason }, traceId: sessionId, spanId: sessionId.slice(0, 16), timestamp: new Date().toISOString() });
              continue;
            }
            if (preResult.action === 'modify' && preResult.modifiedInput) {
              try { effectiveParams = JSON.parse(preResult.modifiedInput); } catch { /* keep original */ }
            }
          }

          let execResult: unknown;
          try {
            execResult = await toolRegistry.execute(tc.function.name, effectiveParams);
          } catch (err: any) {
            this.log.warn({ err, tool: tc.function.name }, '工具执行失败');
            execResult = { error: `工具执行失败: ${err.message}` };
            if (hookRunner) {
              hookRunner.runPostToolUseFailure?.({ name: tc.function.name, input: JSON.stringify(effectiveParams) }, { message: err.message }).catch(() => {});
            }
          }

          if (hookRunner && !(execResult as ToolExecResult)?.error) {
            hookRunner.runPostToolUse({ name: tc.function.name, input: JSON.stringify(effectiveParams) }, { content: JSON.stringify(execResult), isError: false }).catch(() => {});
            eventBus?.emit({ id: `evt_${Date.now().toString(36)}`, type: 'tool.executed', consultationId: sessionId, data: { toolName: tc.function.name, success: true }, traceId: sessionId, spanId: sessionId.slice(0, 16), timestamp: new Date().toISOString() });
          }

          messages.push({
            role: 'tool',
            tool_call_id: crypto.randomUUID(),
            content: JSON.stringify(execResult),
          });
        }
        onToken(']\n');

        continue;
      } catch (err: any) {
        this.log.error({ err, round }, 'streamWithToolLoop: LLM 调用失败');
        return `抱歉，调用失败：${err.message}`;
      }
    }

    // 达到最大轮次
    try {
      const final = await provider.chat(messages);
      for (const ch of (final.content || '')) {
        onToken(ch);
      }
      messages.push({ role: 'assistant', content: final.content || '' });
      return final.content || '(no response)';
    } catch (err: any) {
      this.log.error({ err }, 'streamWithToolLoop: 最终轮 LLM 调用失败');
      return '工具调用超过最大轮次，请稍后重试。';
    }
  }
}
