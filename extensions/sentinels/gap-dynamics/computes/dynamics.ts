/**
 * gap-dynamics/computes/dynamics.ts — 缝隙动力学 (Gap Dynamics)
 *
 * 理论依据: 分析组织协作图谱中的缝隙结构。
 * 缝隙 = 预期应存在协作关系的节点对之间缺乏协作边。
 * 高缝隙密度 = 组织存在大量未被覆盖的协作需求。
 *
 * 参考: packages/engine-core/src/pipeline/diagnosis/gap-dynamics.ts
 */

export interface GapDynamicsResult {
  value: number;       // 0-1, 缝隙强度(越高缝隙越多)
  threshold: 'ok' | 'warning' | 'critical';
  metadata: Record<string, unknown>;
}

interface GraphStoreLike {
  queryNodes(filter?: Record<string, unknown>): Promise<unknown[]>;
  queryEdges(filter?: Record<string, unknown>): Promise<unknown[]>;
}

export async function computeGapDynamics(
  store: GraphStoreLike,
  _orgId: string,
): Promise<GapDynamicsResult> {
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

    const nodeArr = nodes as Array<Record<string, unknown>>;
    const edgeArr = edges as Array<Record<string, unknown>>;

    // Build adjacency set
    const adjSet = new Set<string>();
    for (const e of edgeArr) {
      if (e.source && e.target) {
        adjSet.add(`${e.source}-${e.target}`);
        adjSet.add(`${e.target}-${e.source}`);
      }
    }

    // Count gaps: pairs of nodes in same dimension/team without edge
    let gapCount = 0;
    let pairCount = 0;

    // Group nodes by dimension/team
    const groupMap = new Map<string, Array<Record<string, unknown>>>();
    for (const n of nodeArr) {
      const group = (n.dimension as string) || (n.team as string) || 'default';
      if (!groupMap.has(group)) groupMap.set(group, []);
      groupMap.get(group)!.push(n);
    }

    for (const [, groupNodes] of groupMap) {
      for (let i = 0; i < groupNodes.length; i++) {
        for (let j = i + 1; j < groupNodes.length; j++) {
          pairCount++;
          const id1 = groupNodes[i].id as string;
          const id2 = groupNodes[j].id as string;
          if (id1 && id2 && !adjSet.has(`${id1}-${id2}`)) {
            gapCount++;
          }
        }
      }
    }

    const gapDensity = pairCount > 0 ? gapCount / pairCount : 0.5;

    const threshold: 'ok' | 'warning' | 'critical' =
      gapDensity <= 0.3 ? 'ok'
      : gapDensity <= 0.6 ? 'warning'
      : 'critical';

    return {
      value: Math.round(gapDensity * 100) / 100,
      threshold,
      metadata: {
        gapCount,
        pairCount,
        groupCount: groupMap.size,
        nodeCount: nodeArr.length,
        edgeCount: edgeArr.length,
        interpretation: gapDensity <= 0.3 ? '低缝隙密度'
          : gapDensity <= 0.6 ? '中等缝隙密度'
          : '高缝隙密度',
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
