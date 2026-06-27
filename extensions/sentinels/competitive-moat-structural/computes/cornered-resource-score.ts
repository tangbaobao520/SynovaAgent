export interface ResourceResult { score: number; exclusiveResources: number; locations: number; degraded: boolean; }
export function computeCorneredResource(nodes: Array<{ id: string; type: string; props: Record<string, unknown> }>): ResourceResult {
  if (nodes.length === 0) return { score: 0, exclusiveResources: 0, locations: 0, degraded: true };
  const exclusive = nodes.filter(n => n.props.exclusive === true || n.props.moat === 'resource').length;
  const locations = nodes.filter(n => n.type === 'Location').length;
  return { score: Math.min(exclusive * 0.3 + locations * 0.1, 1), exclusiveResources: exclusive, locations, degraded: false };
}
