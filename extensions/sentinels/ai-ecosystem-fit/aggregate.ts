import type { SentinelFinding } from "../../../src/sentinel/types";
import type { GraphTraversal } from '../../../src/l4/graph-traversal';
import { computeAiEcosystemFit } from "./computes/compute-ai-ecosystem-fit";
import { createLogger } from "@synova/logger";
const log = createLogger("sentinel/ai-ecosystem-fit");
interface GSR { queryNodes(t:string,f?:Record<string,unknown>,g?:string): Array<{id:string;type:string;props:Record<string,unknown>}> }
export const AiEcosystemFitSentinel = {
  async check(s: GSR, tid: string, traversal?: GraphTraversal): Promise<SentinelFinding[]> {
    const now = new Date(); const ca = now.toISOString();
    try {
      // @deprecated — 语义迁移由D15处理
      if (traversal) { const r = traversal.traverse([tid], ['DEPLOYS']); if (!r.nodes[0]) return []; }
      const tools = s.queryNodes("Tool",{tid});
      const aiApis = tools.filter(t => t.props.aiEnabled === true || (t.props.protocol as string || '')?.includes('ai'));
      const aiPlatforms = [...new Set(tools.filter(t => t.props.platform).map(t => t.props.platform as string))];
      const r = computeAiEcosystemFit({
        apiCompatible: aiApis.length,
        totalApis: tools.length,
        platformsCovered: aiPlatforms.length,
        totalPlatforms: 5,
        devEcosystemScore: Math.min(aiPlatforms.length / 3, 1),
      });
      if (r.degraded) return [{description:'',id:`t-na-${now.getTime()}`,severity:"info",title:"无AI生态数据",evidence:[],suggestion:"",detectedAt:ca}];
      if (r.score < 0.3) return [{id:`t-ai-${now.getTime()}`,severity:"warning",title:"AI生态匹配度偏低",description:`匹配度${(r.score*100).toFixed(0)}%`,evidence:[`匹配度: ${(r.score*100).toFixed(0)}%`],suggestion:"增加对主流AI平台的API兼容性",detectedAt:ca}];
      return [];
    } catch(e: unknown) { log.error({e}); return [{id:`e-${now.getTime()}`,severity:"warning",title:"异常",description:`${(e as Error)?.message||""}`,evidence:[],suggestion:"",detectedAt:ca}]; }
  },
};
