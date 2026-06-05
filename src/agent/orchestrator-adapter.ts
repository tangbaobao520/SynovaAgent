/**
 * agent/orchestrator-adapter.ts — engine-core 适配器 (Slice 3.1)
 *
 * 将 synova-agent 的 LLMProvider + ToolRegistry 包装为
 * engine-core 需要的 DiagnosisLLMClient + ToolExecutor 接口。
 *
 * 这是 engine-core 和 synova-agent 之间的胶水层。
 * 零额外依赖 — 纯接口适配。
 */
import type { LLMProvider } from '../providers/types';
import { ToolRegistry } from './tools';
import { createLogger } from '../logger';

const log = createLogger('agent/orchestrator-adapter');

// ═══ engine-core 接口（自声明，避免循环依赖） ═══

/**
 * engine-core 期望的 LLM 客户端接口。
 * 对标 DiagnosisOrchestrator 构造函数的泛型参数 C。
 */
export interface DiagnosisLLMClient {
  consult(systemPrompt: string, userMessage: string): Promise<LLMResponse>;
}

export interface LLMResponse {
  content: string;
  model: string;
}

/**
 * engine-core 期望的工具执行器接口。
 * 对标 DiagnosisOrchestrator 构造函数的泛型参数 T。
 */
export interface ToolExecutor {
  execute(toolName: string, input: string): Promise<ToolResult>;
}

export interface ToolResult {
  content: string;
}

// ═══ Adapters ═══

/**
 * 将 synova-agent LLMProvider 包装为 engine-core DiagnosisLLMClient。
 *
 * Usage:
 *   const client = createDiagnosisLLMClient(provider);
 *   const orchestrator = new DiagnosisOrchestrator(client, toolExecutor);
 */
export function createDiagnosisLLMClient(provider: LLMProvider): DiagnosisLLMClient {
  return {
    async consult(systemPrompt: string, userMessage: string): Promise<LLMResponse> {
      log.debug('consult called with system prompt');
      const result = await provider.chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
      );
      return {
        content: result.content,
        model: result.model || 'unknown',
      };
    },
  };
}

/**
 * 将 synova-agent ToolRegistry 包装为 engine-core ToolExecutor。
 *
 * ToolExecutor.execute 接收 JSON string input，
 * 解析为 Record<string, unknown> 后调用 ToolRegistry.execute。
 *
 * Usage:
 *   const executor = createToolExecutorAdapter(registry);
 *   const orchestrator = new DiagnosisOrchestrator(client, executor);
 */
export function createToolExecutorAdapter(registry: ToolRegistry): ToolExecutor {
  return {
    async execute(toolName: string, input: string): Promise<ToolResult> {
      let params: Record<string, unknown>;
      try {
        params = JSON.parse(input);
      } catch (err) {
        log.warn({ err, toolName, input: input.slice(0, 100) }, '编排器适配调用失败 — 使用空参数');
        params = {};
      }

      try {
        const result = await registry.execute(toolName, params);
        return { content: JSON.stringify(result) };
      } catch (err: any) {
        log.warn({ err, toolName }, 'ToolExecutor: 工具执行失败');
        return { content: JSON.stringify({ error: `工具执行失败: ${err.message}` }) };
      }
    },
  };
}
