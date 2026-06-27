import { describe, it, expect } from "vitest";
import { computeKnowledgeaccessibility } from "../../extensions/sentinels/knowledge-accessibility/computes/compute-knowledge-accessibility";
describe("knowledge-accessibility",()=>{
  it("¿Õdegraded",()=>{expect(computeKnowledgeaccessibility(0).degraded).toBe(true);});
  it("Õý³£",()=>{expect(computeKnowledgeaccessibility(50).score).toBe(0.5);});
});
