/**
 * agent-observer/collector.ts — Agent 活动收集器
 *
 * 接收外部上报的 Agent 活动，upsert 到 SOG 图谱的 AGENT 节点。
 * 铁律 39: L4 本体层。通过 GraphStore 接口操作图数据，不直接访问 L5。
 * 铁律 31: catch 返回 degraded: true，不抛异常阻断调用方。
 *
 * Upsert 策略: queryNodes({ name, platform }) 查找已有节点 → updateNode / createNode。
 * GraphStore 的 createNode 不支持显式 ID，因此用 props 匹配。
 */

import { SOGNodeType } from '@synova/sog-core';
import { createLogger } from '@synova/logger';
import type { GraphStore } from '../l4/graph-bridge';
import type { AgentActivity, ReportResponse } from './types';

const log = createLogger('agent-observer/collector');

/**
 * 收集一次 Agent 活动 → upsert SOG AGENT 节点。
 *
 * 查询策略: 在同一 graph 下按 name + platform 匹配已有 AGENT 节点。
 * 匹配到 → updateNode (递增 activityCount)，未匹配 → createNode。
 *
 * @param store  GraphStore 实例 (通过 createGraphStore 创建)
 * @param activity  外部上报的 Agent 活动数据
 * @returns ReportResponse — 总是返回 { ok: true }，失败时 degraded: true
 */
export function collectActivity(
  store: GraphStore,
  activity: AgentActivity,
): ReportResponse {
  const errors: string[] = [];
  const graph = activity.teamId || 'default';
  const lookupKey = `agent:${activity.platform}:${activity.agentId}`;

  try {
    // 构建 AGENT 节点属性
    const props: Record<string, unknown> = {
      name: activity.name,
      agentType: activity.agentType,
      platform: activity.platform,
      agentId: activity.agentId,
      lastSeen: activity.timestamp,
      status: activity.status || 'active',
      lastToolName: activity.lastToolName || undefined,
    };
    if (activity.model) props.model = activity.model;

    // 按 name + platform 查找已有节点 (一个 platform+agentId 组合应该只有一个)
    const existing = store.queryNodes(SOGNodeType.AGENT, {
      agentId: activity.agentId,
      platform: activity.platform,
    }, graph);

    if (existing.length > 0) {
      // 更新已有节点 — 递增 activityCount
      const node = existing[0];
      const prevCount = (typeof node.props.activityCount === 'number' ? node.props.activityCount : 0) as number;
      props.activityCount = prevCount + 1;
      store.updateNode(node.id, props, graph);
      log.debug({ nodeId: node.id, activityCount: props.activityCount, lookupKey },
        'AGENT 节点已更新');
      return { ok: true, agentNodeId: node.id, action: 'updated', degraded: false, errors: [] };
    }

    // 创建新节点
    props.activityCount = 1;
    const newNodeId = store.createNode(SOGNodeType.AGENT, props, graph);
    log.info({ nodeId: newNodeId, lookupKey, graph },
      'AGENT 节点已创建');
    return { ok: true, agentNodeId: newNodeId, action: 'created', degraded: false, errors: [] };

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(msg);
    log.warn({ err: msg, lookupKey, platform: activity.platform },
      'Agent 活动收集失败 — degraded');
    return { ok: true, agentNodeId: '', action: 'created', degraded: true, errors };
  }
}

/**
 * 批量收集 Agent 活动。
 * 单个失败不影响其他 — 始终返回所有结果。
 */
export function collectActivities(
  store: GraphStore,
  activities: AgentActivity[],
): { results: ReportResponse[]; degraded: boolean } {
  const results: ReportResponse[] = [];
  let degraded = false;

  for (const activity of activities) {
    const result = collectActivity(store, activity);
    if (result.degraded) degraded = true;
    results.push(result);
  }

  return { results, degraded };
}
