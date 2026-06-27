import { describe, it, expect } from "vitest";
import { computeHumanagentboundary } from "../../extensions/sentinels/human-agent-boundary/computes/compute-human-agent-boundary";
describe("human-agent-boundary",()=>{
  it("¿Õdegraded",()=>{expect(computeHumanagentboundary(0).degraded).toBe(true);});
  it("Õý³£",()=>{expect(computeHumanagentboundary(50).score).toBe(0.5);});
});
