/**
 * CPC — 协作协议完备性 (Collaboration Protocol Completeness)
 * 纯计算函数。通过 L4 GraphStore 查询团队协作数据，评估协议完备度。
 * 从 engine-core/cpc.ts 提取算法重写。零 engine-core import。
 */
import type { GraphStoreReader } from '../../../shared/baseline';

interface CPCDimension {
  score: number;        // 0-1
  confidence: 'high' | 'medium' | 'low';
  gaps: string[];
}

interface CPCResult {
  overallScore: number;
  dimensions: Record<string, CPCDimension>;
  teamSize: number;
  recommendation: string;
}

const DIMENSIONS = ['division_of_labor', 'information_flow', 'authority_governance', 'trust_incentive', 'knowledge_sharing', 'external_interface'] as const;

export async function computeCPC(store: GraphStoreReader, teamId: string): Promise<{ value: number; threshold: string; metadata: Record<string, unknown> }> {
  // 查询团队的 Person 节点获取团队规模
  const persons = store.queryNodes('Person', { teamId });
  const teamSize = persons.length;
  if (teamSize === 0) return { value: 0, threshold: 'ok', metadata: { teamSize: 0 } };

  // 查询 INTERACTS_WITH 边获取协作数据
  const edges = store.queryEdges('INTERACTS_WITH', undefined, undefined, teamId);
  const dimensions: Record<string, CPCDimension> = {};
  let totalScore = 0;

  for (const dim of DIMENSIONS) {
    const dimEdges = edges.filter(() => true); // 实际应按维度分类——简化版本
    const score = dimEdges.length > 0 ? Math.min(1, dimEdges.length / (teamSize * 2)) : 0.3;
    const gaps: string[] = [];
    if (score < 0.5) gaps.push(`${dim}: 协作数据不足`);

    dimensions[dim] = { score, confidence: score > 0.5 ? 'medium' : 'low', gaps };
    totalScore += score;
  }

  const overallScore = totalScore / DIMENSIONS.length;
  return {
    value: overallScore,
    threshold: overallScore < 0.4 ? 'critical' : overallScore < 0.6 ? 'warning' : 'ok',
    metadata: { teamSize, dimensionCount: DIMENSIONS.length, edgeCount: edges.length },
  };
}
