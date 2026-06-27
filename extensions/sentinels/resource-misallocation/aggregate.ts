import type { SentinelFinding } from "../../../src/sentinel/types";
import { computeResourcemisallocation } from "./computes/compute-resource-misallocation";
import { createLogger } from "../../../src/logger";
const log = createLogger("sentinel/resource-misallocation");
interface GSR { queryNodes(t:string,f?:Record<string,unknown>,g?:string): Array<{id:string;type:string;props:Record<string,unknown>}> }
export const resourceMisallocationSentinel = {
  async check(s: GSR, tid: string): Promise<SentinelFinding[]> {
    const n = new Date(); const ca = n.toISOString();
    try { const nodes = s.queryNodes("ALL",{tid}); const r = computeResourcemisallocation(nodes.length);
      if (r.score<0.2) return [{id:"s3-${n.getTime()}",severity:"critical" as const,title:"S3低",description:"需改进",evidence:[`${(r.score*100).toFixed(0)}%`],suggestion:"评估。",detectedAt:ca}];
      return [];
    } catch(e: unknown) { log.error({e},"["+tid+"]失败"); return [{id:"e-${n.getTime()}",severity:"warning" as const,title:"异常",description:`${(e as Error)?.message||String(e)}`,evidence:[],suggestion:"检查。",detectedAt:ca}]; }
  },
};
