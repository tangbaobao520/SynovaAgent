export interface PowerResult { powerIndex: number; keyNodes: string[]; totalNodes: number; degraded: boolean; }
export function computeNetworkPower(nodes: Array<{ id: string; type: string; props: Record<string, unknown> }>): PowerResult {
  if (nodes.length === 0) return { powerIndex: 0, keyNodes: [], totalNodes: 0, degraded: true };
  const connections: Record<string, string[]> = {};
  for (const n of nodes) {
    const id = n.id;
    if (!connections[id]) connections[id] = [];
    for (const key of Object.keys(n.props)) {
      if (key === 'manager' || key === 'reportsTo' || key === 'connectsTo') {
        const target = String(n.props[key]);
        if (!connections[id]) connections[id] = [];
        connections[id].push(target);
        if (!connections[target]) connections[target] = [];
        connections[target].push(id);
      }
    }
  }
  const nodeIds = Object.keys(connections);
  const degree = nodeIds.map(id => ({ id, count: connections[id].length }));
  degree.sort((a, b) => b.count - a.count);
  const topDegree = degree[0]?.count || 0;
  const powerIndex = Math.min(topDegree / Math.max(nodeIds.length - 1, 1), 1);
  const keyNodes = degree.filter(d => d.count > 0).slice(0, 5).map(d => `${d.id}(${d.count})`);
  return { powerIndex: Math.round(powerIndex * 100) / 100, keyNodes, totalNodes: nodeIds.length, degraded: false };
}
