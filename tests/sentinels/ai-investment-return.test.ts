import { describe, it, expect } from "vitest";
import { computeAiInvestmentReturn } from "../../extensions/sentinels/ai-investment-return/computes/compute-ai-investment-return";
describe("ai-investment-return",()=>{
  it("空degraded",()=>{expect(computeAiInvestmentReturn({costSaved:0,revenueUplift:0,totalInvestment:0,paybackMonths:0}).degraded).toBe(true);});
  it("全满分=1",()=>{const r=computeAiInvestmentReturn({costSaved:20,revenueUplift:10,totalInvestment:10,paybackMonths:12});expect(r.roi).toBe(1);expect(r.degraded).toBe(false);});
});
