import { describe, it, expect } from "vitest";
import { computeHumanAgentBoundary } from "../../extensions/sentinels/human-agent-boundary/computes/compute-human-agent-boundary";
describe("human-agent-boundary",()=>{
  it("空degraded",()=>{expect(computeHumanAgentBoundary({automatedTasks:0,totalTasks:0,successfulHandoffs:0,totalHandoffs:0,preAgentThroughput:0,postAgentThroughput:0,satisfactionScore:0}).degraded).toBe(true);});
  it("全满分=1",()=>{const r=computeHumanAgentBoundary({automatedTasks:10,totalTasks:10,successfulHandoffs:10,totalHandoffs:10,preAgentThroughput:100,postAgentThroughput:200,satisfactionScore:1});expect(r.score).toBe(1);expect(r.degraded).toBe(false);});
});
