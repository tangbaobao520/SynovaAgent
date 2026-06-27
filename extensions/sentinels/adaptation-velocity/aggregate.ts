import type { SentinelFinding } from "../../../src/sentinel/types";
import { computeAdaptationvelocity } from "./computes/compute-adaptation-velocity";
import { createLogger } from "../../../src/logger";
const log = createLogger("sentinel/adaptation-velocity");
interface GSR { queryNodes(t:string,f?:Record<string,unknown>,g?:string): Array<{id:string;type:string;props:Record<string,unknown>}> }
export const adaptationVelocitySentinel = {
  async check(s: GSR, tid: string): Promise<SentinelFinding[]> {
    const n = new Date(); const ca = n.toISOString();
    try { const nodes = s.queryNodes("ALL",{tid}); const r = computeAdaptationvelocity(nodes.length);
      if (r.score<0.2) return [{id:"s2-${n.getTime()}",severity:"critical" as const,title:"S2低",description:"需改进",evidence:[`${(r.score*100).toFixed(0)}%`],suggestion:"评估。",detectedAt:ca}];
      return [];
    } catch(e: unknown) { log.error({e},"["+tid+"]失败"); return [{id:"e-${n.getTime()}",severity:"warning" as const,title:"异常",description:`${(e as Error)?.message||String(e)}`,evidence:[],suggestion:"检查。",detectedAt:ca}]; }
  },
};
