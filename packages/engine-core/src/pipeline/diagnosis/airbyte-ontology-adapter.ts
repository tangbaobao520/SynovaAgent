import { SOGNodeType, SOGEdgeType } from '@synova/sog-core';
/**
 * airbyte-ontology-adapter.ts — Airbyte Protocol 对齐的 OntologyAdapter (Phase B)
 *
 * 对标 Airbyte CDK: Source.spec() → check() → discover() → read()
 * 数据源适配器实现此接口，自动获得标准化的配置验证、Schema发现、流式读取能力。
 */
import type { OntologyEvent } from './types';
import { createLogger } from '../../infra/logger';

const log = createLogger('diagnosis/airbyte-adapter');

// ═══ Airbyte Protocol Types ═══

export interface ConnectorSpecification {
  documentationUrl: string;
  connectionSpecification: {
    type: 'object';
    properties: Record<string, { type: string; description: string; default?: unknown; airbyte_secret?: boolean }>;
    required: string[];
  };
}

export interface AirbyteConnectionStatus {
  status: 'SUCCEEDED' | 'FAILED';
  message?: string;
}

export interface AirbyteStream {
  name: string;
  jsonSchema: Record<string, unknown>;
  supportedSyncModes: Array<'full_refresh' | 'incremental'>;
  sourceDefinedCursor?: boolean;
  defaultCursorField?: string[];
  sourceDefinedPrimaryKey?: string[][];
}

export interface AirbyteCatalog { streams: AirbyteStream[]; }

export interface ConfiguredAirbyteStream {
  stream: { name: string };
  syncMode: 'full_refresh' | 'incremental';
  cursorField?: string[];
  destinationSyncMode?: string;
}

export interface ConfiguredAirbyteCatalog { streams: ConfiguredAirbyteStream[]; }

export interface SyncState { data: Record<string, unknown>; }

// ═══ OntologyAdapter Interface (Airbyte-aligned) ═══

export interface AirbyteOntologyAdapter {
  spec(): Promise<ConnectorSpecification>;
  check(config: Record<string, unknown>): Promise<AirbyteConnectionStatus>;
  discover(config: Record<string, unknown>): Promise<AirbyteCatalog>;
  read(config: Record<string, unknown>, catalog: ConfiguredAirbyteCatalog, state?: SyncState): AsyncIterable<OntologyEvent>;
}

// ═══ Feishu Adapter ═══

export class FeishuAirbyteAdapter implements AirbyteOntologyAdapter {
  async spec(): Promise<ConnectorSpecification> {
    return {
      documentationUrl: 'https://open.feishu.cn/document',
      connectionSpecification: {
        type: 'object',
        properties: {
          appId: { type: 'string', description: '飞书应用 App ID' },
          appSecret: { type: 'string', description: '飞书应用 App Secret', airbyte_secret: true },
          tenantKey: { type: 'string', description: '飞书租户 Key (可选)', default: '' },
        },
        required: ['appId', 'appSecret'],
      },
    };
  }

  async check(config: Record<string, unknown>): Promise<AirbyteConnectionStatus> {
    if (!config.appId) return { status: 'FAILED', message: '缺少必填字段: appId' };
    if (!config.appSecret) return { status: 'FAILED', message: '缺少必填字段: appSecret' };
    return { status: 'SUCCEEDED' };
  }

  async discover(_config: Record<string, unknown>): Promise<AirbyteCatalog> {
    return {
      streams: [
        { name: 'messages', jsonSchema: { type: 'object', properties: { sender: { type: 'string' }, content: { type: 'string' }, timestamp: { type: 'string' } } }, supportedSyncModes: ['full_refresh', 'incremental'], sourceDefinedCursor: true, defaultCursorField: ['timestamp'] },
        { name: 'users', jsonSchema: { type: 'object', properties: { name: { type: 'string' }, email: { type: 'string' }, department: { type: 'string' } } }, supportedSyncModes: ['full_refresh'], sourceDefinedPrimaryKey: [['email']] },
      ],
    };
  }

  async *read(_config: Record<string, unknown>, catalog: ConfiguredAirbyteCatalog, _state?: SyncState): AsyncIterable<OntologyEvent> {
    for (const stream of catalog.streams) {
      if (stream.stream.name === 'messages') {
        yield { id: `feishu_msg_${Date.now()}`, source: 'feishu', timestamp: new Date().toISOString(), graph: 'default', // TODO(prod): graph/orgId 应从 _config 注入，非硬编码
          nodes: [{ type: SOGNodeType.PERSON, props: { name: '示例用户A', source: 'feishu', externalId: 'ou_xxx' } }],
          edges: [] };
        yield { id: `feishu_msg_${Date.now()+1}`, source: 'feishu', timestamp: new Date().toISOString(), graph: 'default', // TODO(prod): graph/orgId 应从 _config 注入，非硬编码
          nodes: [{ type: SOGNodeType.PERSON, props: { name: '示例用户B', source: 'feishu', externalId: 'ou_yyy' } }],
          edges: [{ type: SOGEdgeType.INTERACTS_WITH, from: 'placeholder_a', to: 'placeholder_b', weight: 1, props: { channel: 'feishu' } }] };
      }
    }
  }
}

// ═══ Git Adapter ═══

export class GitAirbyteAdapter implements AirbyteOntologyAdapter {
  async spec(): Promise<ConnectorSpecification> {
    return {
      documentationUrl: 'https://docs.github.com/en/rest',
      connectionSpecification: {
        type: 'object',
        properties: {
          repoUrl: { type: 'string', description: 'Git 仓库 URL' },
          accessToken: { type: 'string', description: 'GitHub Personal Access Token', airbyte_secret: true },
        },
        required: ['repoUrl'],
      },
    };
  }

  async check(config: Record<string, unknown>): Promise<AirbyteConnectionStatus> {
    return config.repoUrl ? { status: 'SUCCEEDED' } : { status: 'FAILED', message: '缺少必填字段: repoUrl' };
  }

  async discover(_config: Record<string, unknown>): Promise<AirbyteCatalog> {
    return {
      streams: [
        { name: 'commits', jsonSchema: { type: 'object', properties: { author: { type: 'string' }, message: { type: 'string' }, timestamp: { type: 'string' } } }, supportedSyncModes: ['full_refresh', 'incremental'], sourceDefinedCursor: true, defaultCursorField: ['timestamp'] },
      ],
    };
  }

  async *read(_config: Record<string, unknown>, catalog: ConfiguredAirbyteCatalog, _state?: SyncState): AsyncIterable<OntologyEvent> {
    for (const stream of catalog.streams) {
      if (stream.stream.name === 'commits') {
        yield { id: `git_${Date.now()}`, source: 'github', timestamp: new Date().toISOString(), graph: 'default', // TODO(prod): graph/orgId 应从 _config 注入，非硬编码
          nodes: [{ type: SOGNodeType.PERSON, props: { name: '开发者', source: 'github', username: 'dev-user' } }],
          edges: [] };
      }
    }
  }
}
