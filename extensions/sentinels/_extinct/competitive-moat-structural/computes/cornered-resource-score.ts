/**
 * I3 护城河结构性强度: 利基资源
 *
 * 理论依据: Barney (1991) VRIN 框架。独占性资源（排他合同、
 * 地理位置、许可证）是可持续竞争优势的基石。
 *
 * 评分方法:
 * - exclusive: 标注 exclusive 或 moat=resource 的节点数
 * - locations: Location 类型节点数（地域壁垒代理）
 * - score = min(exclusive × 0.3 + locations × 0.1, 1)
 */
export interface ResourceResult {
  score: number;
  exclusiveResources: number;
  locations: number;
  degraded: boolean;
}

export function computeCorneredResource(nodes: Array<{ id: string; type: string; props: Record<string, unknown> }>): ResourceResult {
  if (nodes.length === 0) return { score: 0, exclusiveResources: 0, locations: 0, degraded: true };
  const exclusive = nodes.filter(n => n.props.exclusive === true || n.props.moat === 'resource').length;
  const locations = nodes.filter(n => n.type === 'Location').length;
  return { score: Math.min(exclusive * 0.3 + locations * 0.1, 1), exclusiveResources: exclusive, locations, degraded: false };
}
