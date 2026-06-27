import { describe, it, expect } from "vitest";
import { computeInfodistortion } from "../../extensions/sentinels/info-distortion/computes/compute-info-distortion";
describe("info-distortion",()=>{
  it("¿Õdegraded",()=>{expect(computeInfodistortion(0).degraded).toBe(true);});
  it("Õý³£",()=>{expect(computeInfodistortion(50).score).toBe(0.5);});
});
