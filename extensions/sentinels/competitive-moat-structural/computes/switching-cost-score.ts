export interface SwitchingResult { score: number; integrationCount: number; customWorkflows: number; degraded: boolean; }
export function computeSwitchingCost(nodes: Array<{ id: string; type: string; props: Record<string, unknown> }>): SwitchingResult {
  if (nodes.length === 0) return { score: 0, integrationCount: 0, customWorkflows: 0, degraded: true };
  const integrations = nodes.filter(n => n.type === 'INTEGRATES' || n.props.integration).length;
  const workflows = nodes.filter(n => n.type === 'Process' || n.props.workflow).length;
  return { score: Math.min((integrations + workflows) / 20, 1), integrationCount: integrations, customWorkflows: workflows, degraded: false };
}
