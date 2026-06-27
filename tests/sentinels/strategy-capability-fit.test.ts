import { describe, it, expect } from "vitest";
import { computeStrategycapabilityfit } from "../../extensions/sentinels/strategy-capability-fit/computes/compute-strategy-capability-fit";
describe("strategy-capability-fit",()=>{
  it("¿Õdegraded",()=>{expect(computeStrategycapabilityfit(0).degraded).toBe(true);});
  it("Õý³£",()=>{expect(computeStrategycapabilityfit(50).score).toBe(0.5);});
});
