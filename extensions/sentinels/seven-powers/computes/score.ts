/**
 * SevenPowers — 7 Powers 竞争壁垒评估
 * 基于 Helmer 框架。规则推断可量化壁垒。从 engine-core 提取算法重写。零 engine-core import。
 */
import type { GraphStoreReader } from '../../../shared/baseline';

const SCALE_SIGNALS = ['kubernetes','docker','terraform','aws','cloud','auto-scaling'];
const NETWORK_SIGNALS = ['api','marketplace','platform','sdk','webhook','plugin','ecosystem'];
const SWITCHING_SIGNALS = ['database','postgres','mysql','mongodb','migration','import'];
const CORNERED_SIGNALS = ['patent','exclusive','proprietary','trade secret','domain','niche'];
const PROCESS_SIGNALS = ['agile','scrum','kanban','ci/cd','devops','automation'];
const POWERS = ['scale_economy','network_effect','switching_cost','cornered_resource','brand','counter_positioning','process_power'] as const;

export async function computeSevenPowers(store: GraphStoreReader, teamId: string): Promise<{ value: number; threshold: string; metadata: Record<string, unknown> }> {
  // 查询团队的 TOOL 节点获取软件清单
  const tools = store.queryNodes('Tool', { teamId });
  // 查询 IDENTITY 标记
  const goals = store.queryNodes('Goal', { teamId });
  const toolNames = tools.map(t => String(t.props.name || '')).join(' ').toLowerCase();
  const goalDescs = goals.map(g => String(g.props.description || '')).join(' ').toLowerCase();

  const scores: Record<string, number> = {};
  // Scale Economy
  scores.scale_economy = SCALE_SIGNALS.filter(s => toolNames.includes(s)).length >= 2 ? 0.8 : 0.3;
  // Network Effect
  scores.network_effect = NETWORK_SIGNALS.filter(s => toolNames.includes(s)).length >= 2 ? 0.7 : 0.2;
  // Switching Cost
  scores.switching_cost = SWITCHING_SIGNALS.filter(s => toolNames.includes(s)).length >= 2 ? 0.6 : 0.2;
  // Cornered Resource
  scores.cornered_resource = CORNERED_SIGNALS.some(s => toolNames.includes(s) || goalDescs.includes(s)) ? 0.7 : 0.1;
  // Brand — from identity markers
  scores.brand = goalDescs.includes('brand') || goalDescs.includes('品牌') ? 0.6 : 0.2;
  // Counter-Positioning
  scores.counter_positioning = goalDescs.includes('disrupt') || goalDescs.includes('颠覆') ? 0.7 : 0.1;
  // Process Power
  scores.process_power = PROCESS_SIGNALS.filter(s => toolNames.includes(s)).length >= 3 ? 0.7 : 0.3;

  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0) / POWERS.length;
  return {
    value: totalScore,
    threshold: totalScore > 0.6 ? 'ok' : totalScore > 0.35 ? 'warning' : 'critical',
    metadata: { scores, toolCount: tools.length, powerCount: POWERS.length },
  };
}
