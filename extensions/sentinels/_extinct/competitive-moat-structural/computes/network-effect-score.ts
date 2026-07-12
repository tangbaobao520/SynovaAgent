/**
 * I3 护城河结构性强度: 网络效应
 *
 * 理论依据: Metcalfe 定律 — 网络价值 ∝ n²。
 * 双边平台效应：平台侧和用户侧的互动密度决定网络效应强度。
 *
 * 评分方法:
 * - platforms: 平台/工具侧节点数
 * - users: 总用户/节点数
 * - score = min(platforms × users / 10000, 1)
 */
export interface NetworkResult {
  score: number;
  totalUsers: number;
  platforms: number;
  degraded: boolean;
}

export function computeNetworkEffect(nodes: Array<{ id: string; type: string }>): NetworkResult {
  if (nodes.length === 0) return { score: 0, totalUsers: 0, platforms: 0, degraded: true };
  const platforms = nodes.filter(n => n.type === 'Tool' || n.type === 'Platform').length;
  const users = nodes.length;
  return { score: Math.min(platforms * users / 10000, 1), totalUsers: users, platforms, degraded: false };
}
