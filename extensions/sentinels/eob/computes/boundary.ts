/**
 * eob/computes/boundary.ts — 组织弹性边界 (Elastic Organizational Boundary)
 *
 * 理论依据: ARCH-06 #18 — 诊断人+Agent 混合组织的动态边界管理能力。
 * 核心信号:
 *   1. Agent 流失率 — 角色变更频率
 *   2. 弹性响应速度 — 任务激增到新 Agent 上线的时间间隔
 *   3. 外部依赖比例 — 外部接口使用比例
 *   4. 僵尸权限风险 — 已删除 Agent 的残留合约
 *
 * 参考: packages/engine-core/src/pipeline/diagnosis/eob.ts
 * 适配为图查询接口: store.queryNodes() / store.queryEdges()
 */

import type { GraphStoreLike } from './types';

export interface EOBResult {
  value: number;       // 0-1, 越高越健康
  threshold: 'ok' | 'warning' | 'critical';
  metadata: Record<string, unknown>;
}

export async function computeEOB(
  store: GraphStoreLike,
  _orgId: string,
): Promise<EOBResult> {
  try {
    const nodes = await store.queryNodes().catch(() => []);
    const edges = await store.queryEdges().catch(() => []);

    if (!Array.isArray(nodes) || nodes.length === 0) {
      return {
        value: 0.5,
        threshold: 'warning',
        metadata: {
          degraded: true,
          reason: 'no graph data available',
          nodeCount: 0,
          edgeCount: 0,
        },
      };
    }

    // Compute boundary health from graph data
    const agentNodes = nodes.filter((n: Record<string, unknown>) =>
      (n.type as string)?.toLowerCase() === 'agent'
    );
    const churnEvents = edges.filter((e: Record<string, unknown>) =>
      (e.type as string)?.toLowerCase() === 'role_change'
    );

    const churnRate = agentNodes.length > 0
      ? Math.min(churnEvents.length / agentNodes.length, 1)
      : 0;
    const externalEdges = edges.filter((e: Record<string, unknown>) =>
      (e.type as string)?.toLowerCase() === 'external_interface'
    );
    const externalRatio = edges.length > 0 ? externalEdges.length / edges.length : 0;

    const boundaryHealth = Math.max(0,
      1 - churnRate * 0.4 - externalRatio * 0.3
    );

    const threshold: 'ok' | 'warning' | 'critical' =
      boundaryHealth >= 0.7 ? 'ok'
      : boundaryHealth >= 0.4 ? 'warning'
      : 'critical';

    return {
      value: Math.round(boundaryHealth * 100) / 100,
      threshold,
      metadata: {
        churnRate: Math.round(churnRate * 100) / 100,
        externalRatio: Math.round(externalRatio * 100) / 100,
        agentCount: agentNodes.length,
        totalEdges: edges.length,
      },
    };
  } catch (err) {
    return {
      value: 0,
      threshold: 'critical',
      metadata: { degraded: true, error: String(err) },
    };
  }
}
