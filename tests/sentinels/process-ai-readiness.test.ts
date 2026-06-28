import { describe, it, expect } from "vitest";
import { computeProcessAiReadiness } from "../../extensions/sentinels/process-ai-readiness/computes/compute-process-ai-readiness";
describe("process-ai-readiness",()=>{
  it("¿Õdegraded",()=>{expect(computeProcessAiReadiness(0,0).degraded).toBe(true);});
  it("È«Á¬½Ó=1",()=>{const r=computeProcessAiReadiness(10,10);expect(r.score).toBe(1);expect(r.degraded).toBe(false);});
});
