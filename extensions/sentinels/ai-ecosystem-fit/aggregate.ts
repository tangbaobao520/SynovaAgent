import type { SentinelFinding } from "../../../src/sentinel/types";
import { computeAiecosystemfit } from "./computes/compute-ai-ecosystem-fit";
import { createLogger } from "../../../src/logger";
const log = createLogger("sentinel/ai-ecosystem-fit");
interface GSR { queryNodes(t:string,f?:Record<string,unknown>,g?:string): Array<{id:string;type:string;props:Record<string,unknown>}> }
export const AiecosystemfitSentinel = {
  async check(s: GSR, tid: string): Promise<SentinelFinding[]> {
    const n = new Date(); const ca = n.toISOString();
    try { const r = computeAiecosystemfit(s.queryNodes("Tool",{tid}).length*10);
      if (r.score<0.2) return [{id:"t6-${n.getTime()}",severity:"critical" as const,title:"T6 AI软件生态匹配度低",description:"需改进",evidence:[`${(r.score*100).toFixed(0)}%`],suggestion:"评估改进。",detectedAt:ca}];
      return [];
    } catch(e: unknown) { log.error({e},"["+tid+"]失败"); return [{id:"e-${n.getTime()}",severity:"warning" as const,title:"异常",description:`${(e as Error)?.message||String(e)}`,evidence:[],suggestion:"检查。",detectedAt:ca}]; }
  },
};
