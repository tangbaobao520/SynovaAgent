import { describe, it, expect } from "vitest";
import { computeRoutinemutation } from "../../extensions/sentinels/routine-mutation/computes/compute-routine-mutation";
describe("routine-mutation",()=>{
  it("¿Õdegraded",()=>{expect(computeRoutinemutation(0).degraded).toBe(true);});
  it("Õý³£",()=>{expect(computeRoutinemutation(50).score).toBe(0.5);});
});
