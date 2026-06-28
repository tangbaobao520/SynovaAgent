import { describe, it, expect } from "vitest";
import { computeConnectorCoverage } from "../../extensions/sentinels/connector-coverage/computes/compute-connector-coverage";
describe("connector-coverage",()=>{
  it("¿Õdegraded",()=>{expect(computeConnectorCoverage(0,0).degraded).toBe(true);});
  it("È«Á¬½Ó=1",()=>{const r=computeConnectorCoverage(10,10);expect(r.score).toBe(1);expect(r.degraded).toBe(false);});
});
