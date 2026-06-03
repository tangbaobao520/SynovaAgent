/**
 * connectors/registry.ts — Connector 注册中心 (Slice 4.1)
 *
 * 双向集成平台的基础设施:
 *   - 注册第三方 SaaS 连接器（飞书/NemoClaw/ERP/OA/HR）
 *   - Connector 注册后自动向 ToolRegistry 注册自己的工具
 *   - 生命周期管理: connect → ready → disconnect
 *
 * 对标 MASTER-REPORT Part 3 的 "组织管理的 AWS" 定位。
 */
import { createLogger } from '@synova/logger';
import type { ToolRegistryInterface } from './types';

const log = createLogger('connectors/registry');

// ═══ Types ═══

/** Tool descriptor — matches OpenAI function calling format */
export interface ConnectorTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** Connector status */
export type ConnectorStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/** Connector health */
export interface ConnectorHealth {
  status: ConnectorStatus;
  latencyMs?: number;
  error?: string;
  toolCount: number;
  connectedAt?: string;
}

/** Connector interface — all data connectors must implement */
export interface DataConnector {
  /** Unique connector name (e.g. 'feishu', 'nemoclaw', 'erp-sap') */
  readonly name: string;

  /** Human-readable label */
  readonly label: string;

  /** Tools this connector provides — registered into ToolRegistry on connect */
  getTools(): ConnectorTool[];

  /** Connect to the external system */
  connect(config?: Record<string, unknown>): Promise<void>;

  /** Disconnect gracefully */
  disconnect(): Promise<void>;

  /** Execute a tool call (forwarded from ToolRegistry via ConnectorRegistry) */
  executeTool(toolName: string, params: Record<string, unknown>): Promise<unknown>;

  /** Health check */
  healthCheck(): Promise<ConnectorHealth>;
}

// ═══ ConnectorRegistry ═══

export class ConnectorRegistry {
  private connectors = new Map<string, DataConnector>();
  private toolRegistry: ToolRegistryInterface | null = null;

  /** Bind to ToolRegistry so connector tools auto-register on connect */
  bindToolRegistry(registry: ToolRegistryInterface): void {
    this.toolRegistry = registry;
    log.debug('ToolRegistry 已绑定');
  }

  /** Register a connector (does NOT auto-connect) */
  register(connector: DataConnector): void {
    if (this.connectors.has(connector.name)) {
      log.warn({ name: connector.name }, 'Connector 重复注册，将被覆盖');
    }
    this.connectors.set(connector.name, connector);
    log.info({ name: connector.name, label: connector.label }, 'Connector 已注册');
  }

  /** Unregister a connector (disconnects first if connected) */
  async unregister(name: string): Promise<void> {
    const connector = this.connectors.get(name);
    if (!connector) {
      log.warn({ name }, 'Connector 未找到，无法注销');
      return;
    }
    // Auto-disconnect
    try { await connector.disconnect(); } catch { /* best-effort */ }

    // Unregister tools from ToolRegistry
    if (this.toolRegistry) {
      for (const tool of connector.getTools()) {
        try { this.toolRegistry.unregister(tool.name); } catch { /* tool may not be registered */ }
      }
    }

    this.connectors.delete(name);
    log.info({ name }, 'Connector 已注销');
  }

  /** Connect a registered connector */
  async connect(name: string, config?: Record<string, unknown>): Promise<void> {
    const connector = this.connectors.get(name);
    if (!connector) throw new Error(`Connector 未注册: ${name}`);

    await connector.connect(config);

    // Auto-register connector's tools into ToolRegistry
    if (this.toolRegistry) {
      for (const tool of connector.getTools()) {
        this.toolRegistry.register({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
          executionMode: 'connector',
          handler: async (params: Record<string, unknown>) => {
            return connector.executeTool(tool.name, params);
          },
        } as any);
      }
      log.debug({ name, toolCount: connector.getTools().length }, 'Connector 工具已注册到 ToolRegistry');
    }
  }

  /** Disconnect and optionally unregister */
  async disconnect(name: string): Promise<void> {
    const connector = this.connectors.get(name);
    if (!connector) throw new Error(`Connector 未注册: ${name}`);
    await connector.disconnect();
  }

  /** List all registered connectors */
  list(): Array<{ name: string; label: string; status: ConnectorStatus }> {
    return [...this.connectors.values()].map(c => ({
      name: c.name,
      label: c.label,
      status: 'disconnected', // defaults; real status requires healthCheck
    }));
  }

  /** Get a specific connector */
  get(name: string): DataConnector | undefined {
    return this.connectors.get(name);
  }

  /** Get health for all connectors */
  async getAllHealth(): Promise<Record<string, ConnectorHealth>> {
    const result: Record<string, ConnectorHealth> = {};
    for (const [name, connector] of this.connectors) {
      try {
        result[name] = await connector.healthCheck();
      } catch (err: any) {
        result[name] = { status: 'error', error: err.message, toolCount: 0 };
      }
    }
    return result;
  }
}

// Global singleton
let _globalRegistry: ConnectorRegistry | null = null;

export function getConnectorRegistry(): ConnectorRegistry {
  if (!_globalRegistry) _globalRegistry = new ConnectorRegistry();
  return _globalRegistry;
}
