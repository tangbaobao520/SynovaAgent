/**
 * connectors/types.ts — DataConnector 抽象接口 (双轨策略 #1)
 *
 * 引擎只依赖此接口。NemoClaw MCP 和 DomesticHub 都实现它。
 * 分叉的只是数据接入层——诊断核心代码完全统一。
 *
 * @frozen 2026-06-03 — 拆包前冻结。新增字段必须向后兼容，禁止删除已有字段。
 * @since 0.1.0
 */
import type { SOGNodeType, SOGEdgeType } from '@synova/sog-core';

// ═══ Connector Event Types ═══

export interface ConnectorMessage {
  id: string;
  senderId: string;
  senderName: string;
  recipientIds: string[];
  channel: 'public_channel' | 'direct_message' | 'email' | 'meeting' | 'other';
  content: string;
  timestamp: string;
  platform: string; // 'feishu' | 'dingtalk' | 'wecom' | 'slack' | 'teams' | etc.
}

export interface ConnectorMember {
  id: string;
  name: string;
  email?: string;
  department?: string;
  role?: string;
  managerId?: string;
}

export interface ConnectorEvent {
  id: string;
  eventType: string;
  description: string;
  timestamp: string;
  relatedEntityIds: string[];
  metadata?: Record<string, unknown>;
}

// ═══ Ontology Mapping Result ═══

export interface OntologyMapping {
  nodes: Array<{ type: SOGNodeType; props: Record<string, unknown> }>;
  edges: Array<{ type: SOGEdgeType; from: string; to: string; weight: number; props: Record<string, unknown> }>;
}

// ═══ DataConnector Interface ═══

export interface DataConnector {
  /** 连接器唯一标识 */
  readonly id: string;
  /** 连接器名称 */
  readonly name: string;
  /** 数据源平台 */
  readonly platform: string;

  /** 健康检查 */
  healthCheck(): Promise<{ healthy: boolean; error?: string }>;

  /** 获取指定时间范围内的消息 */
  fetchMessages(orgId: string, since: string, until?: string): Promise<ConnectorMessage[]>;

  /** 获取组织成员列表 */
  fetchMembers(orgId: string): Promise<ConnectorMember[]>;

  /** 获取组织事件（部署、审批、事故等） */
  fetchEvents(orgId: string, since: string, until?: string): Promise<ConnectorEvent[]>;

  /** 将原始数据映射为 SOG 本体事件 */
  mapToOntology(messages: ConnectorMessage[], members: ConnectorMember[], events: ConnectorEvent[], orgId: string): OntologyMapping;
}

// ═══ ToolRegistry 接口 (Slice A.5 — 打破循环依赖) ═══

/**
 * ToolRegistry 的最小接口契约。
 *
 * connector-registry 包只依赖此接口，不依赖 agent/tools 的具体实现。
 * agent/tools.ts 的 ToolRegistry 类实现此接口。
 *
 * @frozen 2026-06-03
 */
export interface ToolRegistryInterface {
  register(tool: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    executionMode?: string;
    connectorName?: string;
    handler: (params: Record<string, unknown>) => Promise<Record<string, unknown>>;
  }): void;

  unregister(name: string): void;

  execute(name: string, params: Record<string, unknown>): Promise<Record<string, unknown>>;

  listTools(): Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    executionMode?: string;
  }>;
}
