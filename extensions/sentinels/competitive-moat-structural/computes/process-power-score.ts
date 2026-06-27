export interface ProcessResult { score: number; documentedProcesses: number; automationRate: number; degraded: boolean; }
export function computeProcessPower(nodes: Array<{ id: string; type: string; props: Record<string, unknown> }>): ProcessResult {
  if (nodes.length === 0) return { score: 0, documentedProcesses: 0, automationRate: 0, degraded: true };
  const processes = nodes.filter(n => n.type === 'Process' || n.type === 'Capability').length;
  const automated = nodes.filter(n => n.props.automated === true || n.props.agentEnabled === true).length;
  const autoRate = processes > 0 ? automated / processes : 0;
  return { score: Math.min(processes / 30 * 0.5 + autoRate * 0.5, 1), documentedProcesses: processes, automationRate: Math.round(autoRate * 100) / 100, degraded: false };
}
