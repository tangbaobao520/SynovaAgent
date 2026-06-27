export interface NetworkResult { score: number; totalUsers: number; platforms: number; degraded: boolean; }
export function computeNetworkEffect(nodes: Array<{ id: string; type: string }>): NetworkResult {
  if (nodes.length === 0) return { score: 0, totalUsers: 0, platforms: 0, degraded: true };
  const platforms = nodes.filter(n => n.type === 'Tool' || n.type === 'Platform').length;
  const users = nodes.length;
  return { score: Math.min(platforms * users / 10000, 1), totalUsers: users, platforms, degraded: false };
}
