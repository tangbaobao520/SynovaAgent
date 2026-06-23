/** HONA — 异质节点网络分析。评估组织网络拓扑健康度。零engine-core import。L4 GraphStore。 */
import type { GraphStoreReader } from '../../../shared/baseline';

export async function computeHONA(store: GraphStoreReader, teamId: string): Promise<{ value: number; threshold: string; metadata: Record<string, unknown> }> {
  const edges = store.queryEdges(undefined, undefined, undefined, teamId);
  const nodes = new Set<string>();
  const adjacency = new Map<string, Set<string>>();

  for (const e of edges) {
    nodes.add(e.from); nodes.add(e.to);
    if (!adjacency.has(e.from)) adjacency.set(e.from, new Set());
    if (!adjacency.has(e.to)) adjacency.set(e.to, new Set());
    adjacency.get(e.from)!.add(e.to);
    adjacency.get(e.to)!.add(e.from);
  }

  // 计算平均度数
  let totalDegree = 0;
  let bridgeCount = 0;
  for (const [nodeId, neighbors] of adjacency) {
    totalDegree += neighbors.size;
    // 桥接节点：度数 > 平均值 × 1.5
  }
  const avgDegree = nodes.size > 0 ? totalDegree / nodes.size : 0;

  for (const [, neighbors] of adjacency) {
    if (neighbors.size > avgDegree * 1.5) bridgeCount++;
  }

  // 网络健康度 = 1 - 孤立节点率 - 桥接过载率
  const isolated = nodes.size - adjacency.size;
  const isolatedRatio = nodes.size > 0 ? isolated / nodes.size : 1;
  const bridgeOverloadRatio = adjacency.size > 0 ? bridgeCount / adjacency.size : 0;

  const healthScore = Math.max(0, 1 - isolatedRatio - bridgeOverloadRatio * 0.5);

  return {
    value: healthScore,
    threshold: isolatedRatio > 0.3 ? 'critical' : healthScore < 0.5 ? 'warning' : 'ok',
    metadata: { nodeCount: nodes.size, avgDegree, bridgeCount, isolatedNodes: isolated, edgeCount: edges.length },
  };
}
