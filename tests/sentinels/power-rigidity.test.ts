import { describe, it, expect } from "vitest";
import { computePowerrigidity } from "../../extensions/sentinels/power-rigidity/computes/compute-power-rigidity";
describe("power-rigidity",()=>{
  it("¿Õdegraded",()=>{expect(computePowerrigidity(0).degraded).toBe(true);});
  it("Õý³£",()=>{expect(computePowerrigidity(50).score).toBe(0.5);});
});
