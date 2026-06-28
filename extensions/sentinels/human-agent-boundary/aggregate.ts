import type { SentinelFinding } from "../../../src/sentinel/types";
import { computeHumanAgentBoundary } from "./computes/compute-human-agent-boundary";
import { createLogger } from "../../../src/logger";
const log = createLogger("sentinel/human-agent-boundary");
interface GSR { queryNodes(t:string,f?:Record<string,unknown>,g?:string): Array<{id:string;type:string;props:Record<string,unknown>}> }
export const HumanAgentBoundarySentinel = {
  async check(s: GSR, tid: string): Promise<SentinelFinding[]> {
    const now = new Date(); const ca = now.toISOString();
    try {
      const tools = s.queryNodes("Tool",{tid});
      const processes = s.queryNodes("Process",{tid});
      const automatedPct = tools.length > 0 ? tools.filter(t => t.props.automated === true).length / tools.length : 0;
      const handoffs = tools.filter(t => t.props.handoff === true);
      const r = computeHumanAgentBoundary({
        automatedTasks: tools.filter(t => t.props.automated === true).length,
        totalTasks: tools.length || 1,
        successfulHandoffs: handoffs.filter(t => t.props.successful === true).length,
        totalHandoffs: handoffs.length || 1,
        preAgentThroughput: 100,
        postAgentThroughput: 100 * (1 + automatedPct * 0.5),
        satisfactionScore: 0.7,
      });
      if (r.degraded) return [{id:`t-na-${now.getTime()}`,severity:"info",title:"无混合边界数据",evidence:[],suggestion:"",detectedAt:ca}];
      if (r.score < 0.3) return [{id:`t-hum-${now.getTime()}`,severity:"warning",title:"人机协同效率偏低",description:`效率${(r.score*100).toFixed(0)}%`,evidence:[`效率: ${(r.score*100).toFixed(0)}%`],suggestion:"优化人机任务分配",detectedAt:ca}];
      return [];
    } catch(e: unknown) { log.error({e}); return [{id:`e-${now.getTime()}`,severity:"warning",title:"异常",description:`${(e as Error)?.message||""}`,evidence:[],suggestion:"",detectedAt:ca}]; }
  },
};
