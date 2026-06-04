/**
 * connectors/feishu.ts — DomesticHub: 飞书数据连接器 (双轨策略 #5)
 *
 * 实现 DataConnector 接口。从飞书获取消息、成员、事件，
 * 映射为 SOG 本体事件。国内轨独立自研，不依赖 NemoClaw。
 */
import type { DataConnector, ConnectorMessage, ConnectorMember, ConnectorEvent, OntologyMapping } from './types';
import { SOGNodeType, SOGEdgeType } from '@synova/sog-core';
import { createLogger } from '../logger';

const log = createLogger('connectors/feishu');

export interface FeishuConfig {
  appId: string;
  appSecret: string;
  tenantKey?: string;
}

/**
 * 飞书数据连接器。
 * Phase B: 生产实现对接飞书服务端 API（消息、通讯录、审批）。
 * 当前 Phase A: 返回空数据 + 完整的映射逻辑骨架，验证接口可行。
 */
export class FeishuConnector implements DataConnector {
  readonly id = 'feishu-connector';
  readonly name = '飞书数据连接器';
  readonly platform = 'feishu';

  private config: FeishuConfig;

  constructor(config: FeishuConfig) {
    this.config = config;
  }

  async healthCheck(): Promise<{ healthy: boolean; error?: string }> {
    if (!this.config.appId || !this.config.appSecret) {
      return { healthy: false, error: '飞书 App ID 或 App Secret 未配置' };
    }
    // Phase B: 调用飞书 tenant_access_token API 验证凭证
    return { healthy: true };
  }

  async fetchMessages(orgId: string, since: string, until?: string): Promise<ConnectorMessage[]> {
    // P1: 激活 Python 连接器 — synova_worker/connectors/feishu.py 已就绪
    // 激活路径: PythonBridge.run('connectors.feishu', 'fetch_messages', { orgId, since, until })
    // 需要有效飞书 App ID + App Secret (配置在 .env 中)
    log.info({ orgId, since, until }, '[feishu] 获取消息 — 待激活 (Python 连接器就绪)');
    return [];
  }

  async fetchMembers(orgId: string): Promise<ConnectorMember[]> {
    log.info({ orgId }, '[feishu] 获取成员 — 待激活 (Python 连接器就绪)');
    return [];
  }

  async fetchEvents(orgId: string, since: string, until?: string): Promise<ConnectorEvent[]> {
    log.info({ orgId, since, until }, '[feishu] 获取事件 — 待激活 (Python 连接器就绪)');
    return [];
  }

  mapToOntology(
    messages: ConnectorMessage[],
    members: ConnectorMember[],
    events: ConnectorEvent[],
    orgId: string,
  ): OntologyMapping {
    const mapping: OntologyMapping = { nodes: [], edges: [] };

    // 1. 成员 → Person 节点
    for (const m of members) {
      mapping.nodes.push({
        type: SOGNodeType.PERSON,
        props: { name: m.name, email: m.email || undefined },
      });
      if (m.department) {
        // 部门 → Team 节点
        mapping.nodes.push({
          type: SOGNodeType.TEAM,
          props: { name: m.department, teamType: 'permanent' },
        });
      }
    }

    // 2. 消息 → INTERACTS_WITH 边
    // (需要节点 ID 映射——由 graph-store 在持久化时分配)
    for (const msg of messages) {
      mapping.edges.push({
        type: SOGEdgeType.INTERACTS_WITH,
        from: msg.senderId,
        to: msg.recipientIds[0] || msg.senderId,
        weight: 1,
        props: { channel: msg.channel },
      });
    }

    // 3. 事件 → Event 节点 + 关联边
    for (const evt of events) {
      mapping.nodes.push({
        type: SOGNodeType.EVENT,
        props: { eventType: evt.eventType, timestamp: evt.timestamp },
      });
      for (const relatedId of evt.relatedEntityIds) {
        mapping.edges.push({
          type: SOGEdgeType.CORRESPONDS_TO,
          from: evt.id,
          to: relatedId,
          weight: 0.7,
          props: { correspondenceType: 'related', confidence: 0.7 },
        });
      }
    }

    log.info({ nodes: mapping.nodes.length, edges: mapping.edges.length, orgId }, '[feishu] 本体映射完成');
    return mapping;
  }
}
