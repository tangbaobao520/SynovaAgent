import { describe, it, expect } from "vitest";
import { computeProcessAiReadiness } from "../../extensions/sentinels/process-ai-readiness/computes/compute-process-ai-readiness";
describe("process-ai-readiness",()=>{
  it("空degraded",()=>{expect(computeProcessAiReadiness({structuredDataRatio:0,digitizedProcesses:0,totalProcesses:0,teamSkillAvg:0}).degraded).toBe(true);});
  it("全满分=1",()=>{const r=computeProcessAiReadiness({structuredDataRatio:1,digitizedProcesses:10,totalProcesses:10,teamSkillAvg:5});expect(r.score).toBe(1);expect(r.degraded).toBe(false);});
});
