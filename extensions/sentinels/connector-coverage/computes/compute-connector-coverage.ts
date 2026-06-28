/**
 * T4: 连接器覆盖率
 *
 * 理论依据: 企业软件生态中，API/连接器覆盖的业务流程比例。
 * 覆盖率越高，自动化和数据流动潜力越大。
 *
 * 评分方法:
 * - coverage = 已连接流程数 / 总业务流程数
 * - 关键业务流程加权 x2
 */
export interface ConnectorCoverageResult {
  coverage: number;
  connectedProcesses: number;
  totalProcesses: number;
  keyProcessesCovered: number;
  degraded: boolean;
}

export function computeConnectorCoverage(params: {
  processes: Array<{ name: string; hasConnector: boolean; isKeyProcess: boolean }>;
}): ConnectorCoverageResult {
  const { processes } = params;
  if (processes.length === 0) return { coverage: 0, connectedProcesses: 0, totalProcesses: 0, keyProcessesCovered: 0, degraded: true };
  const connected = processes.filter(p => p.hasConnector);
  const keyConnected = connected.filter(p => p.isKeyProcess);
  const keyTotal = processes.filter(p => p.isKeyProcess).length;
  const baseScore = connected.length / processes.length;
  const keyBonus = keyTotal > 0 ? keyConnected.length / keyTotal * 0.2 : 0;
  return {
    coverage: Math.round(Math.min(baseScore + keyBonus, 1) * 100) / 100,
    connectedProcesses: connected.length,
    totalProcesses: processes.length,
    keyProcessesCovered: keyConnected.length,
    degraded: false,
  };
}
