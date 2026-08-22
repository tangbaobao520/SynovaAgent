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
import { createLogger } from '@synova/logger';
import { ToolGuard } from '../l3/tool-guard';
import * as crypto from 'crypto';

/** Tool execution result — may contain error property on failure */
interface ToolExecResult {
  error?: string;
  [key: string]: unknown;
}

export class ToolLoopExecutor {
  private ctx: EngineContext;
  private log = createLogger('agent/tool-loop');
  private toolGuard = new ToolGuard();

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
          } catch (err) {
            this.log.warn({ err, name: tc.function.name }, '工具参数解析失败 — degraded');
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
              try { effectiveParams = JSON.parse(preResult.modifiedInput); } catch { this.log.debug('工具参数 JSON 解析失败 — 使用原始参数'); }
            }
          }

          // L3 ToolGuard: 工具调用前检查（循环检测 + 重复失败阻断 + 参数校验）
          const guardDecision = this.toolGuard.beforeCall(tc.function.name, effectiveParams);
          if (!guardDecision.allow) {
            this.log.warn({ tool: tc.function.name, reason: guardDecision.reason }, '工具被 ToolGuard 阻止');
            messages.push({ role: 'tool', tool_call_id: crypto.randomUUID(), content: JSON.stringify({ error: `工具被阻止: ${guardDecision.reason}` }) });
            continue;
          }
          // D473: reminder 注入模型可见上下文（不阻断执行，决策留给模型 — DSH advisory 范式）
          if (guardDecision.level === 'reminder' && guardDecision.reminderMessage) {
            messages.push({
              role: 'tool',
              tool_call_id: crypto.randomUUID(),
              content: JSON.stringify({ reminder: guardDecision.reminderMessage }),
            });
          }

          const execResult = await toolRegistry.execute(tc.function.name, effectiveParams);

          // L3 ToolGuard: 工具调用后记录（失败计数）
          this.toolGuard.afterCall(tc.function.name, execResult, 0);

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
            await sleep(5); // P3-06: 5ms/char 流式动画
          }
          messages.push({ role: 'assistant', content });
          return content || '(empty response)';
        }

        // 有工具调用
        this.log.debug({ count: result.toolCalls.length, round }, 'streamWithToolLoop: 工具调用');

        for (const ch of content) {
          onToken(ch);
          await sleep(5);
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
          } catch (err) {
            this.log.warn({ err, name: tc.function.name }, '工具参数解析失败 — degraded');
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
              try { effectiveParams = JSON.parse(preResult.modifiedInput); } catch { this.log.debug('工具参数 JSON 解析失败 — 使用原始参数'); }
            }
          }

          // L3 ToolGuard: 工具调用前检查（streaming 路径）
          const guardDecision = this.toolGuard.beforeCall(tc.function.name, effectiveParams);
          if (!guardDecision.allow) {
            this.log.warn({ tool: tc.function.name, reason: guardDecision.reason }, '工具被 ToolGuard 阻止');
            messages.push({ role: 'tool', tool_call_id: crypto.randomUUID(), content: JSON.stringify({ error: `工具被阻止: ${guardDecision.reason}` }) });
            continue;
          }
          // D473: reminder 注入模型可见上下文（streaming 路径同样消费，不阻断执行）
          if (guardDecision.level === 'reminder' && guardDecision.reminderMessage) {
            messages.push({
              role: 'tool',
              tool_call_id: crypto.randomUUID(),
              content: JSON.stringify({ reminder: guardDecision.reminderMessage }),
            });
          }

          let execResult: unknown;
          try {
            execResult = await toolRegistry.execute(tc.function.name, effectiveParams);
          } catch (err: any) {
            this.log.warn({ err, tool: tc.function.name }, '工具执行失败');
            execResult = { error: `工具执行失败: ${err.message}` };
            if (hookRunner) {
              hookRunner.runPostToolUseFailure?.({ name: tc.function.name, input: JSON.stringify(effectiveParams) }, new Error(err.message)).catch((hookErr) => {
                this.log.warn({ hookErr, tool: tc.function.name }, 'PostToolUseFailure hook 执行失败 — 非阻断');
              });
            }
          }

          // L3 ToolGuard: 工具调用后记录
          this.toolGuard.afterCall(tc.function.name, execResult, 0);

          if (hookRunner && !(execResult as ToolExecResult)?.error) {
            hookRunner.runPostToolUse({ name: tc.function.name, input: JSON.stringify(effectiveParams) }, { content: JSON.stringify(execResult), isError: false }).catch((hookErr) => {
              this.log.warn({ hookErr, tool: tc.function.name }, 'PostToolUse hook 执行失败 — 非阻断');
            });
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
        await sleep(5);
      }
      messages.push({ role: 'assistant', content: final.content || '' });
      return final.content || '(no response)';
    } catch (err: any) {
      this.log.error({ err }, 'streamWithToolLoop: 最终轮 LLM 调用失败');
      return '工具调用超过最大轮次，请稍后重试。';
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
