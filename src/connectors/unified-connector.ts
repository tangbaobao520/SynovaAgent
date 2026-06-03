/**
 * connectors/unified-connector.ts — L5 统一连接器接口
 *
 * L5-DATA-LAYER: 统一 3 套接口为 1 套 Airbyte 协议接口。
 * Mark old DataConnector as @deprecated.
 */
import type { ConnectorMessage, ConnectorMember, ConnectorEvent, OntologyMapping } from './types';

// ═══ Unified SynovaConnector (Airbyte protocol) ═══

export interface ConnectorSpec {
  name: string;
  label: string;
  platform: string;
  configSchema: Record<string, unknown>;
  supportedStreams: string[];
}

export interface ConnectionStatus {
  healthy: boolean;
  error?: string;
  latencyMs?: number;
}

export interface OntologyEvent {
  eventType: 'node_created' | 'edge_created' | 'node_updated' | 'edge_removed' | 'sync_complete';
  nodeType?: string;
  nodeId?: string;
  edgeType?: string;
  fromId?: string;
  toId?: string;
  props?: Record<string, unknown>;
  graph: string;
  timestamp: string;
  source: string;
}

export interface SynovaConnector {
  // Airbyte 4 methods (data channel)
  spec(): ConnectorSpec;
  check(config: Record<string, unknown>): Promise<ConnectionStatus>;
  discover(config: Record<string, unknown>): Promise<string[]>;
  read(config: Record<string, unknown>, streams: string[], state?: Record<string, unknown>): AsyncIterable<OntologyEvent>;

  // Lifecycle
  connect(config: Record<string, unknown>): Promise<void>;
  disconnect(): Promise<void>;
  healthCheck(): Promise<ConnectionStatus>;
}

// ═══ Adapter: Legacy DataConnector → SynovaConnector ═══

import type { DataConnector } from './types';

/**
 * Wrap legacy fetch-based DataConnector as SynovaConnector.
 * Enables gradual migration — existing connectors work while new ones adopt Airbyte protocol.
 */
export function adaptLegacyConnector(legacy: DataConnector, orgId: string): SynovaConnector {
  return {
    spec() {
      return {
        name: legacy.name,
        label: legacy.name,
        platform: legacy.platform,
        configSchema: { type: 'object', properties: { orgId: { type: 'string' } } },
        supportedStreams: ['members', 'messages', 'events'],
      };
    },
    async check(_config) {
      const result = await legacy.healthCheck();
      return { healthy: result.healthy, error: result.error };
    },
    async discover(_config) {
      return ['members', 'messages', 'events'];
    },
    async *read(_config, streams, _state) {
      const now = new Date().toISOString();
      const since = new Date(Date.now() - 7 * 86400000).toISOString(); // 7 days

      if (streams.includes('members')) {
        const members = await legacy.fetchMembers(orgId);
        for (const m of members) {
          yield {
            eventType: 'node_created',
            nodeType: 'Person',
            nodeId: `feishu_${m.id}`,
            props: { name: m.name, email: m.email, source: legacy.platform, sourceId: m.id },
            graph: orgId, timestamp: now, source: legacy.name,
          };
        }
      }

      if (streams.includes('messages')) {
        const messages = await legacy.fetchMessages(orgId, since);
        for (const msg of messages) {
          yield {
            eventType: 'edge_created',
            edgeType: 'INTERACTS_WITH',
            fromId: `feishu_${msg.senderId}`,
            toId: `channel_${msg.channelId}`,
            props: { channelId: msg.channelId, content: msg.content.slice(0, 100), source: legacy.platform },
            graph: orgId, timestamp: msg.timestamp, source: legacy.name,
          };
        }
      }

      yield {
        eventType: 'sync_complete',
        graph: orgId, timestamp: new Date().toISOString(), source: legacy.name,
      };
    },
    async connect(_config) { /* noop — legacy adapters manage their own connection */ },
    async disconnect() { /* noop */ },
    async healthCheck() {
      const result = await legacy.healthCheck();
      return { healthy: result.healthy, error: result.error };
    },
  };
}
