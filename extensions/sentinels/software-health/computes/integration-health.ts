/**
 * integration-health.ts — T1 哨兵 compute 函数
 *
 * 集成健康度 — 有 API 连接的工具比例
 * ConnectivityRate = Systems_With_DEPENDS_ON_Edges / Total_Systems
 *
 * 本体映射: Tool::url/endpoint, DEPENDS_ON边
 * 阈值: <50% → 数据孤岛
 */
export interface IntegrationHealthResult {
  connectivityRate: number;
  connectedSystems: number;
  totalSystems: number;
  isolatedSystems: string[];
  signal: 'critical' | 'warning' | 'healthy';
  degraded: boolean;
  warnings: string[];
}

export function computeIntegrationHealth(
  tools: Array<{ id: string; hasOutEdge: boolean }>,
): IntegrationHealthResult {
  const warnings: string[] = [];

  if (tools.length === 0) {
    return {
      connectivityRate: 0,
      connectedSystems: 0,
      totalSystems: 0,
      isolatedSystems: [],
      signal: 'healthy',
      degraded: true,
      warnings: ['No tool data available'],
    };
  }

  const connected = tools.filter(t => t.hasOutEdge);
  const isolated = tools.filter(t => !t.hasOutEdge);
  const rate = connected.length / tools.length;

  let signal: 'critical' | 'warning' | 'healthy';
  if (rate < 0.5) {
    signal = 'critical';
  } else if (rate < 0.8) {
    signal = 'warning';
  } else {
    signal = 'healthy';
  }

  return {
    connectivityRate: Math.round(rate * 100) / 100,
    connectedSystems: connected.length,
    totalSystems: tools.length,
    isolatedSystems: isolated.map(t => t.id),
    signal,
    degraded: false,
    warnings,
  };
}
