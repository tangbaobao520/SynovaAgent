/**
 * connectors/types.ts — re-export from @synova/connector-registry
 *
 * @synova/connector-registry@0.1.0
 */
export type {
  DataConnector,
  ConnectorTool,
  ConnectorStatus,
  ConnectorHealth,
  ToolRegistryInterface,
} from '@synova/connector-registry';

// Legacy types (used by feishu.ts, nemoclaw.ts — kept for compatibility)
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
