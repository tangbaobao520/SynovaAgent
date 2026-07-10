import type { SentinelFinding } from "../../../src/sentinel/types";
import type { GraphTraversal } from '../../../src/l4/graph-traversal';
import { computeConnectorCoverage } from "./computes/compute-connector-coverage";
import { createLogger } from "@synova/logger";
const log = createLogger("sentinel/connector-coverage");
interface GSR { queryNodes(t:string,f?:Record<string,unknown>,g?:string): Array<{id:string;type:string;props:Record<string,unknown>}> }
export const ConnectorCoverageSentinel = {
  async check(s: GSR, tid: string, traversal?: GraphTraversal): Promise<SentinelFinding[]> {
    const now = new Date(); const ca = now.toISOString();
    try {
      // @deprecated — 语义迁移由D15处理
      if (traversal) { const r = traversal.traverse([tid], ['DEPLOYS']); if (!r.nodes[0]) return []; }
      const nodes = s.queryNodes("Tool",{tid});
      const processes = nodes.map(n => ({
        name: n.id,
        hasConnector: !!(n.props.protocol || n.props.connector || n.props.integration),
        isKeyProcess: n.type === 'Process' || n.props.critical === true,
      }));
      const r = computeConnectorCoverage({ processes });
      if (r.degraded) return [{id:`t-na-${now.getTime()}`,severity:"info",title:"无连接器数据",description:"",evidence:[],suggestion:"",detectedAt:ca}];
      if (r.coverage < 0.3) return [{id:`t-con-${now.getTime()}`,severity:"warning",title:"连接器覆盖率偏低",description:`覆盖${(r.coverage*100).toFixed(0)}%`,evidence:[`覆盖率: ${(r.coverage*100).toFixed(0)}%`],suggestion:"增加关键业务流程的API连接器",detectedAt:ca}];
      return [];
    } catch(e: unknown) { log.error({e}); return [{id:`e-${now.getTime()}`,severity:"warning",title:"异常",description:`${(e as Error)?.message||""}`,evidence:[],suggestion:"",detectedAt:ca}]; }
  },
};
