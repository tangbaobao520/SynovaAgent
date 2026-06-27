import { describe, it, expect } from "vitest";
import { computeChannelcapacity } from "../../extensions/sentinels/channel-capacity/computes/compute-channel-capacity";
describe("channel-capacity",()=>{
  it("¿Õdegraded",()=>{expect(computeChannelcapacity(0).degraded).toBe(true);});
  it("Õý³£",()=>{expect(computeChannelcapacity(50).score).toBe(0.5);});
});
