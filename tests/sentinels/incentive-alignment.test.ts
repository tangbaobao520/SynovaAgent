import { describe, it, expect } from "vitest";
import { computeIncentivealignment } from "../../extensions/sentinels/incentive-alignment/computes/compute-incentive-alignment";
describe("incentive-alignment",()=>{
  it("¿Õdegraded",()=>{expect(computeIncentivealignment(0).degraded).toBe(true);});
  it("Õý³£",()=>{expect(computeIncentivealignment(50).score).toBe(0.5);});
});
