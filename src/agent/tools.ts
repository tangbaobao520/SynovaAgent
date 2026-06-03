/**
 * agent/tools.ts — 工具注册与执行引擎 (Era 2.2)
 *
 * 对标 engine-core 的 ToolExecutor + Hermes tools/registry.py。
 * 工具在对话中被 LLM 调用，结果注入上下文。
 *
 * 流程: LLM → tool call → ToolRegistry.execute() → result → LLM → 最终回复
 */
import { createLogger } from '../logger';
import type { ToolRegistryInterface } from '../connectors/types';

const log = createLogger('agent/tools');

// ═══ Types ═══

export interface ToolParameter {
  type: string;
  description?: string;
  enum?: string[];
}

export interface ToolSchema {
  type: 'object';
  properties: Record<string, ToolParameter>;
  required?: string[];
  /** DeepSeek V4 Strict Mode — 必须为 false 以启用服务端 Schema 验证 */
  additionalProperties?: boolean;
}

/** Execution mode — determines how the tool is dispatched (Slice 1.2 + 4.1) */
export type ToolExecutionMode = 'local' | 'connector' | 'remote-agent' | 'http';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolSchema;
  /** Execution mode (default: 'local') */
  executionMode?: ToolExecutionMode;
  /** HTTP endpoint (required when executionMode='http') */
  httpEndpoint?: string;
  /** Connector name (required when executionMode='connector') */
  connectorName?: string;
  handler: (params: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

export interface ToolCallResult {
  [key: string]: unknown;
  error?: string;
}

// ═══ ToolRegistry ═══

export class ToolRegistry implements ToolRegistryInterface {
  private tools = new Map<string, ToolDefinition>();
  /** Cached OpenAI-compatible tool schema (P1: DeepSeek prefix cache optimization) */
  private _cachedOpenAITools: Array<{
    type: 'function';
    function: { name: string; description: string; parameters: ToolSchema; strict?: boolean };
  }> | null = null;
  private _toolCacheVersion = 0;
  private connectorRegistry: unknown = null; // ConnectorRegistry reference (lazy)

  /** Bind to ConnectorRegistry for 'connector' mode tools (Slice 4.1) */
  bindConnectorRegistry(registry: unknown): void {
    this.connectorRegistry = registry;
    log.debug('ConnectorRegistry 已绑定到 ToolRegistry');
  }

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
    this._cachedOpenAITools = null; // invalidate cache
    this._toolCacheVersion++;
    log.debug({ name: tool.name, mode: tool.executionMode || 'local' }, 'Tool registered');
  }

  /** Unregister a tool by name (Slice 1.2) */
  unregister(name: string): void {
    if (!this.tools.has(name)) {
      log.warn({ name }, '尝试取消注册不存在的工具');
      return;
    }
    this.tools.delete(name);
    log.debug({ name }, 'Tool unregistered');
  }

  listTools(): ToolDefinition[] {
    return [...this.tools.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  /** List tools filtered by execution mode (Slice 1.2) */
  listByMode(mode: ToolExecutionMode): ToolDefinition[] {
    return this.listTools().filter(t => (t.executionMode || 'local') === mode);
  }

  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /** 执行工具，支持多模式分发 (Slice 1.2)，永不抛异常 */
  async execute(name: string, params: Record<string, unknown>): Promise<ToolCallResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      log.warn({ name }, '未知工具调用');
      return { error: `未知工具: ${name}` };
    }

    const mode = tool.executionMode || 'local';

    try {
      log.info({ name, params, mode }, '执行工具');

      switch (mode) {
        case 'local':
          return await tool.handler(params);

        case 'connector': {
          if (!this.connectorRegistry) {
            return { error: 'ConnectorRegistry 未绑定，无法执行 connector 模式工具' };
          }
          const reg = this.connectorRegistry as { get(name: string): { executeTool(n: string, p: Record<string, unknown>): Promise<unknown> } | undefined };
          const connector = reg.get(tool.connectorName || '');
          if (!connector) {
            return { error: `Connector "${tool.connectorName}" 未注册` };
          }
          const result = await connector.executeTool(name, params);
          return result as ToolCallResult;
        }

        case 'http': {
          if (!tool.httpEndpoint) {
            return { error: `HTTP 模式工具 "${name}" 缺少 httpEndpoint` };
          }
          const res = await fetch(tool.httpEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params),
            signal: AbortSignal.timeout(30000),
          });
          if (!res.ok) {
            return { error: `HTTP 工具 ${name} 返回 ${res.status}` };
          }
          return (await res.json()) as ToolCallResult;
        }

        case 'remote-agent': {
          // Future: delegate to remote agent executor
          return { error: `remote-agent 模式尚未实现: ${name}` };
        }

        default:
          return await tool.handler(params);
      }
    } catch (err: any) {
      log.error({ err, name, mode }, '工具执行失败');
      return { error: `工具 ${name} 执行失败: ${err.message}` };
    }
  }

  /** 生成 OpenAI 兼容的 function calling schema (P1: 固化缓存 — DeepSeek prefix cache 优化) */
  toOpenAITools(): Array<{
    type: 'function';
    function: { name: string; description: string; parameters: ToolSchema; strict?: boolean };
  }> {
    if (this._cachedOpenAITools) return this._cachedOpenAITools;
    // 按名称排序确保跨请求的工具定义顺序一致（Prefix Cache 关键）
    this._cachedOpenAITools = this.listTools().map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: this._injectStrictMode(t.parameters),
        strict: true, // DeepSeek V4 Strict Mode — 服务端 Schema 验证，消除参数幻觉
      },
    }));
    return this._cachedOpenAITools;
  }

  /** DeepSeek V4 Strict Mode: 确保 additionalProperties: false */
  private _injectStrictMode(schema: ToolSchema): ToolSchema {
    if (schema.type === 'object' && schema.additionalProperties === undefined) {
      return { ...schema, additionalProperties: false };
    }
    return schema;
  }
}
