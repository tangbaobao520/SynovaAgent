import { describe, it, expect } from "vitest";
import { computeAgentdeploymentmaturity } from "../../extensions/sentinels/agent-deployment-maturity/computes/compute-agent-deployment-maturity";
describe("agent-deployment-maturity",()=>{
  it("¿Õdegraded",()=>{expect(computeAgentdeploymentmaturity(0).degraded).toBe(true);});
  it("Õý³£",()=>{expect(computeAgentdeploymentmaturity(50).score).toBe(0.5);});
});
