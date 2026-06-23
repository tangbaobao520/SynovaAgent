/** HTM — 混合信任模型。评估人-Agent信任校准度。零engine-core import。L4 GraphStore。 */
import type { GraphStoreReader } from '../../../shared/baseline';

export async function computeHTM(store: GraphStoreReader, teamId: string): Promise<{ value: number; threshold: string; metadata: Record<string, unknown> }> {
  const agents = store.queryNodes('Agent', { teamId });
  const persons = store.queryNodes('Person', { teamId });
  const edges = store.queryEdges('INTERACTS_WITH', undefined, undefined, teamId);

  // 自动接受率 = Agent→Person 边中无人工干预的比例
  const agentIds = new Set(agents.map(a => a.id));
  const agentEdges = edges.filter(e => agentIds.has(e.from) || agentIds.has(e.to));
  const totalInteractions = agentEdges.length || 1;
  const weightedEdges = agentEdges.filter(e => e.weight > 0.7).length;

  const autoAcceptRate = weightedEdges / totalInteractions;
  // 信任衰减事件 = 低权重 Agent 边
  const decayEvents = agentEdges.filter(e => e.weight < 0.3).length;

  const trustScore = autoAcceptRate * (1 - decayEvents / totalInteractions);

  return {
    value: trustScore,
    threshold: decayEvents > 5 ? 'critical' : trustScore < 0.5 ? 'warning' : 'ok',
    metadata: { autoAcceptRate, decayEvents, totalInteractions, agentCount: agents.length },
  };
}
