import { describe, it, expect } from "vitest";
import { computeTalentdensity } from "../../extensions/sentinels/talent-density/computes/compute-talent-density";
describe("talent-density",()=>{
  it("¿Õdegraded",()=>{expect(computeTalentdensity(0).degraded).toBe(true);});
  it("Õý³£",()=>{expect(computeTalentdensity(50).score).toBe(0.5);});
});
