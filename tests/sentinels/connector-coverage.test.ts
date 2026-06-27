import { describe, it, expect } from "vitest";
import { computeConnectorcoverage } from "../../extensions/sentinels/connector-coverage/computes/compute-connector-coverage";
describe("connector-coverage",()=>{
  it("¿Õdegraded",()=>{expect(computeConnectorcoverage(0).degraded).toBe(true);});
  it("Õý³£",()=>{expect(computeConnectorcoverage(50).score).toBe(0.5);});
});
