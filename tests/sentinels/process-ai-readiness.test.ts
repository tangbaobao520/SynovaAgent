import { describe, it, expect } from "vitest";
import { computeProcessaireadiness } from "../../extensions/sentinels/process-ai-readiness/computes/compute-process-ai-readiness";
describe("process-ai-readiness",()=>{
  it("¿Õdegraded",()=>{expect(computeProcessaireadiness(0).degraded).toBe(true);});
  it("Õý³£",()=>{expect(computeProcessaireadiness(50).score).toBe(0.5);});
});
