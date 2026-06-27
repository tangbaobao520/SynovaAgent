import { describe, it, expect } from "vitest";
import { computeResourcemisallocation } from "../../extensions/sentinels/resource-misallocation/computes/compute-resource-misallocation";
describe("resource-misallocation",()=>{
  it("¿Õdegraded",()=>{expect(computeResourcemisallocation(0).degraded).toBe(true);});
  it("Õý³£",()=>{expect(computeResourcemisallocation(50).score).toBe(0.5);});
});
