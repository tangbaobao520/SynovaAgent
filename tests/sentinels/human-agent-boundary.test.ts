import { describe, it, expect } from "vitest";
import { computeHumanAgentBoundary } from "../../extensions/sentinels/human-agent-boundary/computes/compute-human-agent-boundary";
describe("human-agent-boundary",()=>{
  it("¿Õdegraded",()=>{expect(computeHumanAgentBoundary(0,0).degraded).toBe(true);});
  it("È«Á¬½Ó=1",()=>{const r=computeHumanAgentBoundary(10,10);expect(r.score).toBe(1);expect(r.degraded).toBe(false);});
});
