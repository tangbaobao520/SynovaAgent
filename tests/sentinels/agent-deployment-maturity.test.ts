import { describe, it, expect } from "vitest";
import { computeAgentDeploymentMaturity } from "../../extensions/sentinels/agent-deployment-maturity/computes/compute-agent-deployment-maturity";
describe("agent-deployment-maturity",()=>{
  it("¿Õdegraded",()=>{expect(computeAgentDeploymentMaturity(0,0).degraded).toBe(true);});
  it("È«Á¬½Ó=1",()=>{const r=computeAgentDeploymentMaturity(10,10);expect(r.score).toBe(1);expect(r.degraded).toBe(false);});
});
