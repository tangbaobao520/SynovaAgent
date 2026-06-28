import type { SentinelFinding } from "../../../src/sentinel/types";
import { computeAgentDeploymentMaturity } from "./computes/compute-agent-deployment-maturity";
import { createLogger } from "../../../src/logger";
const log = createLogger("sentinel/agent-deployment-maturity");
interface GSR { queryNodes(t:string,f?:Record<string,unknown>,g?:string): Array<{id:string;type:string;props:Record<string,unknown>}> }
export const AgentDeploymentMaturitySentinel = {
  async check(s: GSR, tid: string): Promise<SentinelFinding[]> {
    const now = new Date(); const ca = now.toISOString();
    try {
      const agents = s.queryNodes("Agent",{tid});
      const tools = s.queryNodes("Tool",{tid});
      const monitoredAgents = agents.filter(a => a.props.monitored === true).length;
      const recentErrors = tools.filter(t => t.props.error === true || t.props.failing === true).length;
      const totalOps = tools.length || 1;
      const r = computeAgentDeploymentMaturity({
        agentCount: agents.length,
        autonomyLevel: 2,
        monitoredAgents,
        totalAgents: agents.length || 1,
        recentErrors,
        totalOperations: totalOps,
      });
      if (r.degraded) return [{id:`t-na-${now.getTime()}`,severity:"info",title:"无Agent数据",evidence:[],suggestion:"",detectedAt:ca}];
      if (r.score < 0.3) return [{id:`t-age-${now.getTime()}`,severity:"warning",title:"Agent部署成熟度偏低",description:`成熟度${(r.score*100).toFixed(0)}%`,evidence:[`成熟度: ${(r.score*100).toFixed(0)}%`],suggestion:"增加Agent监控和自治等级",detectedAt:ca}];
      return [];
    } catch(e: unknown) { log.error({e}); return [{id:`e-${now.getTime()}`,severity:"warning",title:"异常",description:`${(e as Error)?.message||""}`,evidence:[],suggestion:"",detectedAt:ca}]; }
  },
};
