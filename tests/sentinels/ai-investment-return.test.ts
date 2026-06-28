import { describe, it, expect } from "vitest";
import { computeAiInvestmentReturn } from "../../extensions/sentinels/ai-investment-return/computes/compute-ai-investment-return";
describe("ai-investment-return",()=>{
  it("¿Õdegraded",()=>{expect(computeAiInvestmentReturn(0,0).degraded).toBe(true);});
  it("È«Á¬½Ó=1",()=>{const r=computeAiInvestmentReturn(10,10);expect(r.score).toBe(1);expect(r.degraded).toBe(false);});
});
