import type { SentinelFinding } from "../../../src/sentinel/types";
import { computeAgentDeploymentMaturity } from "./computes/compute-agent-deployment-maturity";
import { createLogger } from "../../../src/logger";
const log = createLogger("sentinel/agent-deployment-maturity");
interface GSR { queryNodes(t:string,f?:Record<string,unknown>,g?:string): Array<{id:string;type:string;props:Record<string,unknown>}> }
export const AgentDeploymentMaturitySentinel = {
  async check(s: GSR, tid: string): Promise<SentinelFinding[]> {
    const now = new Date(); const ca = now.toISOString();
    try {
      const nodes = s.queryNodes("Tool",{tid});
      const connected = nodes.filter(n => n.props.protocol || n.props.connector || n.props.integration).length;
      const r = computeAgentDeploymentMaturity(nodes.length, connected);
      if (r.degraded) return [{id:"t-na-${now.getTime()}",severity:"info",title:"无数据",evidence:[],suggestion:"",detectedAt:ca}];
      if (r.score < 0.3) return [{id:"t-age-${now.getTime()}",severity:"warning",title:"AGE覆盖率低",description:"低于30%",evidence:[`覆盖: ${(r.score*100).toFixed(0)}%`],suggestion:"评估。",detectedAt:ca}];
      return [];
    } catch(e: unknown) { log.error({e}); return [{id:"e-${now.getTime()}",severity:"warning",title:"异常",description:`${(e as Error)?.message||""}`,evidence:[],suggestion:"",detectedAt:ca}]; }
  },
};
