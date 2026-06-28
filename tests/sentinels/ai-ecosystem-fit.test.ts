import { describe, it, expect } from "vitest";
import { computeAiEcosystemFit } from "../../extensions/sentinels/ai-ecosystem-fit/computes/compute-ai-ecosystem-fit";
describe("ai-ecosystem-fit",()=>{
  it("¿Õdegraded",()=>{expect(computeAiEcosystemFit(0,0).degraded).toBe(true);});
  it("È«Á¬½Ó=1",()=>{const r=computeAiEcosystemFit(10,10);expect(r.score).toBe(1);expect(r.degraded).toBe(false);});
});
