/**
 * data-health/computes/data-silo-score.ts — 数据孤岛率计算
 *
 * 评估系统间数据连通性：孤岛节点比例、连接密度。
 * 纯函数: 输入节点+边列表，输出孤岛指标。
 */
export interface DataSiloResult {
  siloRate: number;          // 孤岛节点比例（越高越差）
  connectivityDensity: number; // 连接密度
  siloCount: number;
  totalSystems: number;
  degraded: boolean;
}

export interface SystemNode {
  id: string;
  name: string;
}

export interface DataFlowEdge {
  from: string;
  to: string;
}

export function computeDataSiloScore(
  systems: SystemNode[],
  edges: DataFlowEdge[]
): DataSiloResult {
  if (systems.length < 2) {
    return { siloRate: 0, connectivityDensity: 1, siloCount: 0, totalSystems: systems.length, degraded: true };
  }

  const connected = new Set<string>();
  for (const e of edges) {
    connected.add(e.from);
    connected.add(e.to);
  }

  // 孤岛：没有出现在任何边中的系统
  const silos = systems.filter(s => !connected.has(s.id) && !connected.has(s.name));
  const siloRate = silos.length / systems.length;

  // 连接密度
  const maxEdges = systems.length * (systems.length - 1);
  const connectivityDensity = maxEdges > 0 ? edges.length / maxEdges : 0;

  return { siloRate, connectivityDensity, siloCount: silos.length, totalSystems: systems.length, degraded: false };
}
