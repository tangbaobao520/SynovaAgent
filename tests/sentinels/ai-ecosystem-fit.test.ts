import { describe, it, expect } from "vitest";
import { computeAiecosystemfit } from "../../extensions/sentinels/ai-ecosystem-fit/computes/compute-ai-ecosystem-fit";
describe("ai-ecosystem-fit",()=>{
  it("¿Õdegraded",()=>{expect(computeAiecosystemfit(0).degraded).toBe(true);});
  it("Õý³£",()=>{expect(computeAiecosystemfit(50).score).toBe(0.5);});
});
