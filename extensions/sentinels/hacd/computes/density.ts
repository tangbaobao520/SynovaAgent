/** HACD — 人机协作深度。评估L0(完全人工)到L4(完全自主)。零engine-core import。L4 GraphStore。 */
import type { GraphStoreReader } from '../../../shared/baseline';

export async function computeHACD(store: GraphStoreReader, teamId: string): Promise<{ value: number; threshold: string; metadata: Record<string, unknown> }> {
  const agents = store.queryNodes('Agent', { teamId });
  const persons = store.queryNodes('Person', { teamId });
  const processes = store.queryNodes('Process', { teamId });

  // 协作深度 = Agent参与流程占比 × 自主决策权重
  const agentProcesses = processes.filter(p => {
    const desc = String(p.props.description || '');
    return desc.includes('agent') || desc.includes('Agent') || desc.includes('自动') || desc.includes('auto');
  });
  const automationRatio = processes.length > 0 ? agentProcesses.length / processes.length : 0;

  // Agent人均协作密度
  const density = persons.length > 0 ? agents.length / persons.length : 0;

  const score = automationRatio * 0.6 + Math.min(density * 5, 1) * 0.4;

  return {
    value: score,
    threshold: score < 0.2 ? 'critical' : score < 0.4 ? 'warning' : 'ok',
    metadata: { automationRatio, density, agentCount: agents.length, personCount: persons.length, processCount: processes.length },
  };
}
