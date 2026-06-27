import { describe, it, expect } from "vitest";
import { computeOrgrepairability } from "../../extensions/sentinels/org-repairability/computes/compute-org-repairability";
describe("org-repairability",()=>{
  it("¿Õdegraded",()=>{expect(computeOrgrepairability(0).degraded).toBe(true);});
  it("Õý³£",()=>{expect(computeOrgrepairability(50).score).toBe(0.5);});
});
