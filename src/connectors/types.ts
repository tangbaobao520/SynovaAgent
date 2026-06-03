/**
 * connectors/types.ts — 数据模型类型 (连接器数据 + SOG 本体)
 *
 * 连接器接口定义在 @synova/connector-registry (独立包):
 *   SynovaConnector (Airbyte 协议: spec/check/discover/read)
 *   DataConnector (旧接口, @deprecated — 迁移到 SynovaConnector)
 *
 * 本文件的 ConnectorMessage/ConnectorMember/ConnectorEvent 是数据模型类型,
 * 与连接器接口定义不重复 — 它们描述连接器产出的数据形状。
 */
export type {
  DataConnector,
  ConnectorTool,
  ConnectorStatus,
  ConnectorHealth,
  ToolRegistryInterface,
} from '@synova/connector-registry';

export type { SOGNodeType, SOGEdgeType } from '@synova/sog-core';

export interface ConnectorMessage {
  id: string;
  senderId: string;
  senderName?: string;
  channelId: string;
  channelName?: string;
  content: string;
  timestamp: string;
  threadId?: string;
  reactions?: Array<{ type: string; count: number }>;
}

export interface ConnectorMember {
  id: string;
  name: string;
  email?: string;
  teams?: string[];
  role?: string;
  joinedAt?: string;
}

export interface ConnectorEvent {
  id: string;
  type: string;
  actorId: string;
  targetId?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface OntologyMapping {
  nodes: Array<{ type: string; props: Record<string, unknown> }>;
  edges: Array<{ type: string; from: string; to: string; props?: Record<string, unknown> }>;
}

/**
 * @deprecated L5-DATA-LAYER: 使用 SynovaConnector (Airbyte协议) 替代。
 * 见 src/connectors/unified-connector.ts — adaptLegacyConnector() 迁移工具
 */
export interface DataConnector {
  readonly name: string;
  readonly platform: string;
  healthCheck(): Promise<{ healthy: boolean; error?: string }>;
  fetchMessages(orgId: string, since: string, until?: string): Promise<ConnectorMessage[]>;
  fetchMembers(orgId: string): Promise<ConnectorMember[]>;
  fetchEvents(orgId: string, since: string, until?: string): Promise<ConnectorEvent[]>;
  mapToOntology(messages: ConnectorMessage[], members: ConnectorMember[], events: ConnectorEvent[], orgId: string): OntologyMapping;
}
