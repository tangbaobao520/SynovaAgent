/**
 * I3 护城河结构性强度: 流程权力
 *
 * 理论依据: 流程权力 = 文档化流程 × 自动化率。
 * Porter 价值链理论: 嵌入流程的知识是企业持续竞争优势来源。
 *
 * 评分方法:
 * - processes: Process/Capability 类型节点数量
 * - automated: 标注 automated 或 agentEnabled 的节点
 * - score = min(processes/30 × 0.5 + automationRate × 0.5, 1)
 */
export interface ProcessResult {
  score: number;
  documentedProcesses: number;
  automationRate: number;
  degraded: boolean;
}

export function computeProcessPower(nodes: Array<{ id: string; type: string; props: Record<string, unknown> }>): ProcessResult {
  if (nodes.length === 0) return { score: 0, documentedProcesses: 0, automationRate: 0, degraded: true };
  const processes = nodes.filter(n => n.type === 'Process' || n.type === 'Capability').length;
  const automated = nodes.filter(n => n.props.automated === true || n.props.agentEnabled === true).length;
  const autoRate = processes > 0 ? automated / processes : 0;
  return { score: Math.min(processes / 30 * 0.5 + autoRate * 0.5, 1), documentedProcesses: processes, automationRate: Math.round(autoRate * 100) / 100, degraded: false };
}
