/**
 * @synova/connector-registry — Synova Connector Registry
 *
 * 双向集成平台的基础设施。
 * 公开 API: DataConnector, ConnectorRegistry, getConnectorRegistry, ToolRegistryInterface
 */
export type {
  DataConnector,
  ConnectorTool,
  ConnectorStatus,
  ConnectorHealth,
  ToolRegistryInterface,
} from './types';

export {
  ConnectorRegistry,
  getConnectorRegistry,
} from './registry';
