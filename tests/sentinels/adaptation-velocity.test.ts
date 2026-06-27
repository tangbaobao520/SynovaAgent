import { describe, it, expect } from "vitest";
import { computeAdaptationvelocity } from "../../extensions/sentinels/adaptation-velocity/computes/compute-adaptation-velocity";
describe("adaptation-velocity",()=>{
  it("¿Õdegraded",()=>{expect(computeAdaptationvelocity(0).degraded).toBe(true);});
  it("Õý³£",()=>{expect(computeAdaptationvelocity(50).score).toBe(0.5);});
});
