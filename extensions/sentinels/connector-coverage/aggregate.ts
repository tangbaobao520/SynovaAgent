import type { SentinelFinding } from "../../../src/sentinel/types";
import { computeConnectorcoverage } from "./computes/compute-connector-coverage";
import { createLogger } from "../../../src/logger";
const log = createLogger("sentinel/connector-coverage");
interface GSR { queryNodes(t:string,f?:Record<string,unknown>,g?:string): Array<{id:string;type:string;props:Record<string,unknown>}> }
export const ConnectorcoverageSentinel = {
  async check(s: GSR, tid: string): Promise<SentinelFinding[]> {
    const n = new Date(); const ca = n.toISOString();
    try { const r = computeConnectorcoverage(s.queryNodes("Tool",{tid}).length*10);
      if (r.score<0.2) return [{id:"t4-${n.getTime()}",severity:"critical" as const,title:"T4 连接器覆盖率低",description:"需改进",evidence:[`${(r.score*100).toFixed(0)}%`],suggestion:"评估改进。",detectedAt:ca}];
      return [];
    } catch(e: unknown) { log.error({e},"["+tid+"]失败"); return [{id:"e-${n.getTime()}",severity:"warning" as const,title:"异常",description:`${(e as Error)?.message||String(e)}`,evidence:[],suggestion:"检查。",detectedAt:ca}]; }
  },
};
