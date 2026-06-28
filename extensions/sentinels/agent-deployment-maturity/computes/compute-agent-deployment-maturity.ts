export function computeAgentDeploymentMaturity(total: number, hasConnector: number): {score: number;degraded: boolean} {
  if (total === 0) return {score: 0.5, degraded: true};
  return {score: Math.round(hasConnector/total*100)/100, degraded: false};
}
