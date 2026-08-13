import { describe, it, expect } from "vitest";
import { computeAiEcosystemFit } from "../../extensions/sentinels/ai-ecosystem-fit/computes/compute-ai-ecosystem-fit";
describe("ai-ecosystem-fit",()=>{
  it("空degraded",()=>{expect(computeAiEcosystemFit({apiCompatible:0,totalApis:0,platformsCovered:0,totalPlatforms:0,devEcosystemScore:0}).degraded).toBe(true);});
  it("全满分=1",()=>{const r=computeAiEcosystemFit({apiCompatible:10,totalApis:10,platformsCovered:5,totalPlatforms:5,devEcosystemScore:1});expect(r.score).toBe(1);expect(r.degraded).toBe(false);});
});
