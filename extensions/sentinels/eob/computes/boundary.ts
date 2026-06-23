/** EOB — 组织弹性边界。评估Agent流失率+弹性响应+外部比例+僵尸权限。零engine-core import。L4 GraphStore。 */
import type { GraphStoreReader } from '../../../shared/baseline';

export async function computeEOB(store: GraphStoreReader, teamId: string): Promise<{ value: number; threshold: string; metadata: Record<string, unknown> }> {
  const agents = store.queryNodes('Agent', { teamId });
  const externalAgents = agents.filter(a => a.props.agentType === 'external');
  const inactiveAgents = agents.filter(a => a.props.status === 'inactive' || a.props.status === 'offline');

  // Agent流失率
  const churnRate = agents.length > 0 ? inactiveAgents.length / agents.length : 0;

  // 外部比例
  const externalRatio = agents.length > 0 ? externalAgents.length / agents.length : 0;

  // 僵尸权限风险 (inactive agent 仍有关联边)
  const edges = store.queryEdges(undefined, undefined, undefined, teamId);
  const inactiveIds = new Set(inactiveAgents.map(a => a.id));
  const zombieEdges = edges.filter(e => inactiveIds.has(e.from) || inactiveIds.has(e.to));
  const zombieRisk = agents.length > 0 ? Math.min(1, zombieEdges.length / (agents.length * 2)) : 0;

  // 边界健康度
  const boundaryHealth = Math.max(0, 1 - churnRate * 0.4 - zombieRisk * 0.3 - Math.abs(externalRatio - 0.3) * 0.3);

  return {
    value: boundaryHealth,
    threshold: churnRate > 0.3 || zombieRisk > 0.5 ? 'critical' : boundaryHealth < 0.5 ? 'warning' : 'ok',
    metadata: { churnRate, externalRatio, zombieRisk, zombieEdgeCount: zombieEdges.length, agentCount: agents.length },
  };
}
