/**
 * api-coverage/computes/protocol-coverage.ts — 标准协议覆盖率计算
 *
 * 统计 TOOL 节点中使用的协议类型与标准协议的匹配度。
 * 纯函数: 输入节点列表，输出协议覆盖率。
 */
const STANDARD_PROTOCOLS = ['MCP', 'REST', 'GraphQL', 'gRPC', 'WebSocket', 'OData'];

export interface ProtocolCoverageResult {
  coverage: number;
  coveredProtocols: string[];
  uncoveredProtocols: string[];
  customOrUnlabeled: string[];
  totalTools: number;
  degraded: boolean;
}

export function computeProtocolCoverage(
  tools: Array<{ id: string; name: string; protocol?: string }>
): ProtocolCoverageResult {
  if (tools.length === 0) {
    return { coverage: 1, coveredProtocols: [], uncoveredProtocols: [], customOrUnlabeled: [], totalTools: 0, degraded: true };
  }

  const coveredSet = new Set<string>();
  const customOrUnlabeled: string[] = [];

  for (const t of tools) {
    if (t.protocol && STANDARD_PROTOCOLS.some(p => t.protocol!.toUpperCase().includes(p.toUpperCase()))) {
      coveredSet.add(t.protocol);
    } else if (t.protocol) {
      customOrUnlabeled.push(`${t.name} (${t.protocol})`);
    } else {
      customOrUnlabeled.push(`${t.name} (未标注协议)`);
    }
  }

  const coverage = coveredSet.size / STANDARD_PROTOCOLS.length;
  const uncoveredProtocols = STANDARD_PROTOCOLS.filter(p => !coveredSet.has(p));

  return {
    coverage,
    coveredProtocols: [...coveredSet],
    uncoveredProtocols,
    customOrUnlabeled,
    totalTools: tools.length,
    degraded: false,
  };
}
