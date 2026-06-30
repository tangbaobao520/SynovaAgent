import { describe, it, expect } from "vitest";
import { computeAgentDeploymentMaturity } from "../../extensions/sentinels/agent-deployment-maturity/computes/compute-agent-deployment-maturity";
describe("agent-deployment-maturity",()=>{
  it("空degraded",()=>{expect(computeAgentDeploymentMaturity({agentCount:0,autonomyLevel:0,monitoredAgents:0,totalAgents:0,recentErrors:0,totalOperations:0}).degraded).toBe(true);});
  it("全满分=1",()=>{const r=computeAgentDeploymentMaturity({agentCount:20,autonomyLevel:4,monitoredAgents:10,totalAgents:10,recentErrors:0,totalOperations:10});expect(r.score).toBe(1);expect(r.degraded).toBe(false);});
});
