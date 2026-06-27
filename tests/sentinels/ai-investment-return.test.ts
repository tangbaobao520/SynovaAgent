import { describe, it, expect } from "vitest";
import { computeAiinvestmentreturn } from "../../extensions/sentinels/ai-investment-return/computes/compute-ai-investment-return";
describe("ai-investment-return",()=>{
  it("¿Õdegraded",()=>{expect(computeAiinvestmentreturn(0).degraded).toBe(true);});
  it("Õý³£",()=>{expect(computeAiinvestmentreturn(50).score).toBe(0.5);});
});
