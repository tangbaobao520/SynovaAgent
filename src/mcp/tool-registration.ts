/**
 * mcp/tool-registration.ts — MCP 工具注册到 ToolRegistry (Tasks 2/3/4)
 *
 * 铁律 39: L5 组件。将外部 MCP Server 的工具注册为 agent tools。
 *
 * Task 2: Brave Search — 替换专家 interview_required 存根
 * Task 3: query_sog_graph — 动态 SOG 图查询 (替代硬编码 QueryAPI)
 * Task 4: GitHub MCP — 技术专家工具
 */
import type { ToolRegistry } from '../agent/tools';
import { getMCPBridge, type MCPToolDef } from './bridge';
import { createLogger } from '../logger';

const log = createLogger('mcp/tool-registration');

/**
 * Register all MCP tools into a ToolRegistry.
 * Each MCP tool becomes a 'connector' mode tool — executed via MCPBridge.
 */
export async function registerMCPTools(registry: ToolRegistry): Promise<void> {
  const bridge = getMCPBridge();

  // ── Task 2: Brave Search (all experts can use) ──
  try {
    const braveTools = await bridge.connect('brave-search');
    for (const tool of braveTools) {
      registry.register({
        name: `brave_${tool.name}`,
        description: `[Brave Search] ${tool.description}`,
        parameters: { type: 'object', properties: tool.parameters as Record<string, unknown> },
        operationType: 'read',
        sideEffects: 'none',
        executionMode: 'connector',
        connectorName: 'brave-search',
        handler: async (params) => {
          const result = await bridge.callTool('brave-search', tool.name, params);
          return { content: result.content?.[0]?.text || JSON.stringify(result) };
        },
      });
    }
    log.info({ toolCount: braveTools.length }, 'Brave Search 工具已注册');
  } catch (err: any) {
    log.warn({ err: err.message }, 'Brave Search 注册失败 — degraded (BRAVE_API_KEY 未配置)');
  }

  // ── Task 4: GitHub MCP (tech expert) ──
  try {
    const ghTools = await bridge.connect('github');
    for (const tool of ghTools) {
      registry.register({
        name: `github_${tool.name}`,
        description: `[GitHub] ${tool.description}`,
        parameters: { type: 'object', properties: tool.parameters as Record<string, unknown> },
        operationType: 'read',
        sideEffects: 'none',
        executionMode: 'connector',
        connectorName: 'github',
        handler: async (params) => {
          const result = await bridge.callTool('github', tool.name, params);
          return { content: result.content?.[0]?.text || JSON.stringify(result) };
        },
      });
    }
    log.info({ toolCount: ghTools.length }, 'GitHub 工具已注册');
  } catch (err: any) {
    log.warn({ err: err.message }, 'GitHub 注册失败 — degraded (GITHUB_TOKEN 未配置)');
  }

  // ── Task 3: query_sog_graph (dynamic SOG graph query) ──
  // Replaces hardcoded QueryAPI.findDiagnosticPaths/summarizeSubgraph/findCrossDimensionalBrokers
  registry.register({
    name: 'query_sog_graph',
    description: '查询 SOG 组织本体图：支持路径查找(findPath)、子图摘要(summarize)、跨维度中介(brokers)、三元组正则匹配(matchTriples)',
    parameters: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['findPath', 'summarize', 'brokers', 'matchTriples'] },
        fromType: { type: 'string', description: '起始节点类型 (findPath)' },
        toType: { type: 'string', description: '目标节点类型 (findPath)' },
        rootId: { type: 'string', description: '根节点 ID (summarize)' },
        maxDepth: { type: 'number', description: '最大深度 (summarize)' },
        pattern: { type: 'object', description: '三元组模式 (matchTriples)' },
        graph: { type: 'string', description: '租户 ID (默认 default)' },
      },
      required: ['operation'],
    },
    operationType: 'read',
    sideEffects: 'none',
    executionMode: 'local',
    handler: async (params) => {
      // Dynamically import L4 graph query to avoid circular deps
      const { findDiagnosticPaths, summarizeSubgraph, findCrossDimensionalBrokers } =
        await import('../l4/diagnosis-graph-query');
      const { createGraphStore } = await import('@synova/diagnosis-engine');
      const { getDatabase } = await import('../init/engine-context');

      const db = getDatabase();
      const store = createGraphStore('sqlite', db) as {
        queryNodes(t: string, f?: Record<string,unknown>, g?: string): Array<{id:string;type:string;props:Record<string,unknown>}>;
        queryEdges(t?: string, f?: string, to?: string, g?: string): Array<{from:string;to:string;type:string;props:Record<string,unknown>}>;
        queryTriples(p: Record<string,unknown>, g?: string): unknown[];
      };
      const graph = (params.graph as string) || 'default';

      switch (params.operation) {
        case 'findPath': {
          const paths = findDiagnosticPaths(
            store as Parameters<typeof findDiagnosticPaths>[0],
            graph,
            String(params.fromType || ''),
            String(params.toType || ''),
          );
          return { paths };
        }
        case 'summarize': {
          const summary = summarizeSubgraph(
            store as Parameters<typeof summarizeSubgraph>[0],
            graph,
            String(params.rootId || ''),
            Number(params.maxDepth || 3),
          );
          return { summary };
        }
        case 'brokers': {
          const brokers = findCrossDimensionalBrokers(
            store as Parameters<typeof findCrossDimensionalBrokers>[0],
            graph,
          );
          return { brokers };
        }
        case 'matchTriples': {
          const triples = store.queryTriples(
            (params.pattern as Record<string, unknown>) || {},
            graph,
          );
          return { triples };
        }
        default:
          return { error: `未知操作: ${params.operation}` };
      }
    },
  });
  log.info('query_sog_graph 已注册 (动态 L4 图查询)');
}
