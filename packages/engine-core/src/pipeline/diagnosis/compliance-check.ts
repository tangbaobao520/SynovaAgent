/**
 * diagnosis/compliance-check.ts — 合规检查 (SOG v1.0 新建, P2)
 *
 * 评估组织对关键法规/标准的覆盖情况。
 * 基于 Compliance 节点 + DEPENDS_ON/OWNS/CORRESPONDS_TO 边。
 *
 * 算法：对每个 Compliance 节点，检查其关联的 Process/Document 节点数量。
 * status 已由人工或系统标记，模块负责聚合和覆盖度计算。
 */

import { SOGNodeType, SOGEdgeType } from '@synova/sog-core';
import type { DiagnosticModule } from './module-registry';

export interface ComplianceEntry {
  id: string;
  name: string;
  type: 'regulation' | 'standard' | 'policy';
  status: 'compliant' | 'non_compliant' | 'partial';
  coveredProcesses: string[];
  missingCoverage: string[];
}

export interface ComplianceCheckReport {
  compliances: ComplianceEntry[];
  overallCoverage: number; // 0-1
  interpretation: string;
}

export function computeComplianceCheck(
  compliances: Array<{
    id: string;
    name: string;
    complianceType: 'regulation' | 'standard' | 'policy';
    status: 'compliant' | 'non_compliant' | 'partial';
  }>,
  edges: Array<{ from: string; to: string; type: SOGEdgeType }>,
  processDocIds: string[],
): ComplianceCheckReport {
  if (compliances.length === 0) {
    return {
      compliances: [],
      overallCoverage: 1,
      interpretation: '未配置合规节点。建议为组织建立合规清单。',
    };
  }

  const processDocSet = new Set(processDocIds);
  const entries: ComplianceEntry[] = [];

  for (const c of compliances) {
    const connectedEdges = edges.filter(
      e => (e.from === c.id || e.to === c.id) &&
        [SOGEdgeType.DEPENDS_ON, SOGEdgeType.OWNS, SOGEdgeType.CORRESPONDS_TO].includes(e.type),
    );

    const coveredProcesses = connectedEdges
      .map(e => e.from === c.id ? e.to : e.from)
      .filter(id => processDocSet.has(id));

    const missingCoverage = connectedEdges.length === 0
      ? ['未关联任何流程或文档']
      : [];

    entries.push({
      id: c.id,
      name: c.name,
      type: c.complianceType,
      status: c.status,
      coveredProcesses,
      missingCoverage,
    });
  }

  const compliantCount = entries.filter(e => e.status === 'compliant').length;
  const compliantOrPartial = entries.filter(e => e.status !== 'non_compliant').length;
  const overallCoverage = compliantOrPartial / entries.length;

  return {
    compliances: entries,
    overallCoverage: Math.round(overallCoverage * 1000) / 1000,
    interpretation: `共 ${entries.length} 项合规要求，${compliantCount} 项完全合规，整体覆盖度 ${(overallCoverage * 100).toFixed(0)}%。`,
  };
}

export const complianceCheckModule: DiagnosticModule = {
  id: 'compliance-check',
  version: '1.0.0',
  priority: 'P2',
  requiredDataSources: {},
  confidenceModel: 'deterministic',
  label: '合规检查',
  description: 'SOG v1.0: Compliance 节点覆盖度评估',
  ontologyRole: 'analyzer',
  compute: async (_teamId: string) => { return null; },
};
