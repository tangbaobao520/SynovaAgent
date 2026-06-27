import type { SentinelFinding } from "../../../src/sentinel/types";
import { computeAgentdeploymentmaturity } from "./computes/compute-agent-deployment-maturity";
import { createLogger } from "../../../src/logger";
const log = createLogger("sentinel/agent-deployment-maturity");
interface GSR { queryNodes(t:string,f?:Record<string,unknown>,g?:string): Array<{id:string;type:string;props:Record<string,unknown>}> }
export const AgentdeploymentmaturitySentinel = {
  async check(s: GSR, tid: string): Promise<SentinelFinding[]> {
    const n = new Date(); const ca = n.toISOString();
    try { const r = computeAgentdeploymentmaturity(s.queryNodes("Tool",{tid}).length*10);
      if (r.score<0.2) return [{id:"t7-${n.getTime()}",severity:"critical" as const,title:"T7 Agent部署成熟度低",description:"需改进",evidence:[`${(r.score*100).toFixed(0)}%`],suggestion:"评估改进。",detectedAt:ca}];
      return [];
    } catch(e: unknown) { log.error({e},"["+tid+"]失败"); return [{id:"e-${n.getTime()}",severity:"warning" as const,title:"异常",description:`${(e as Error)?.message||String(e)}`,evidence:[],suggestion:"检查。",detectedAt:ca}]; }
  },
};
