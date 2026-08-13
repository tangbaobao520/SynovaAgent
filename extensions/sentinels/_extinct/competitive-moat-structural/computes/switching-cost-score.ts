/**
 * I3 护城河结构性强度: 转换成本
 *
 * 理论依据: Shapiro & Varian (1999) 锁定效应。集成深度 +
 * 自定义工作流数量构成真实转换障碍 — 离得越贵，粘性越强。
 *
 * 评分方法:
 * - integrations: INTEGRATES 类型或标注 integration 的节点数
 * - workflows: Process 类型或标注 workflow 的节点数
 * - score = min((integrations + workflows) / 20, 1)
 */
export interface SwitchingResult {
  score: number;
  integrationCount: number;
  customWorkflows: number;
  degraded: boolean;
}

export function computeSwitchingCost(nodes: Array<{ id: string; type: string; props: Record<string, unknown> }>): SwitchingResult {
  if (nodes.length === 0) return { score: 0, integrationCount: 0, customWorkflows: 0, degraded: true };
  const integrations = nodes.filter(n => n.type === 'INTEGRATES' || n.props.integration).length;
  const workflows = nodes.filter(n => n.type === 'Process' || n.props.workflow).length;
  return { score: Math.min((integrations + workflows) / 20, 1), integrationCount: integrations, customWorkflows: workflows, degraded: false };
}
