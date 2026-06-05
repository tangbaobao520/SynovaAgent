/**
 * init/connector-binding.ts — Connector ↔ ToolRegistry 桥接 (Slice A.5)
 *
 * 打破 tools.ts ↔ connectors/registry.ts 的潜在循环依赖。
 * 所有 Connector→Tool 的运行时绑定集中在此文件处理。
 *
 * tools.ts 不需要知道 connectors 的存在。
 * connectors/registry.ts 只依赖 ToolRegistryInterface (不依赖具体实现)。
 *
 * @since 0.2.0
 */
import { getConnectorRegistry } from '../connectors/registry';
import type { ToolRegistry } from '../agent/tools';
import { createLogger } from '../logger';

const log = createLogger('init/connector-binding');

/**
 * 将所有已连接的 Connector 的工具注册到 ToolRegistry。
 *
 * 调用时机: synova-agent 启动后 (start() 方法中)。
 * 连接器注册后，其工具自动在 ToolRegistry 中可用，
 * LLM 即可通过 tool_call 调用连接器能力。
 *
 * @param toolRegistry - ToolRegistry 实例 (实现在 agent/tools.ts)
 */
export function bindConnectorTools(toolRegistry: ToolRegistry): void {
  const registry = getConnectorRegistry();
  registry.bindToolRegistry(toolRegistry as unknown as import('../connectors/types').ToolRegistryInterface);

  for (const c of registry.list()) {
    const conn = registry.get(c.name);
    if (!conn) continue;

    for (const tool of conn.getTools()) {
      try {
        toolRegistry.register({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters as unknown as import('../agent/tools').ToolSchema,
          executionMode: 'connector',
          connectorName: conn.name,
          handler: async (params: Record<string, unknown>) =>
            (await conn.executeTool(tool.name, params)) as unknown as Record<string, unknown>,
        });
      } catch (err: any) {
        log.warn({ err, connector: conn.name, tool: tool.name },
          'Connector 工具注册失败');
      }
    }
  }
  log.debug({ connectorCount: registry.list().length }, 'Connector 工具绑定完成');
}
