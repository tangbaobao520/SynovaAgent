import { describe, it, expect } from "vitest";
import { computeRoutinediffusion } from "../../extensions/sentinels/routine-diffusion/computes/compute-routine-diffusion";
describe("routine-diffusion",()=>{
  it("¿Õdegraded",()=>{expect(computeRoutinediffusion(0).degraded).toBe(true);});
  it("Õý³£",()=>{expect(computeRoutinediffusion(50).score).toBe(0.5);});
});
