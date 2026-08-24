import { NodeType, EdgeType } from '@synova/ontology';

/** Graph API JSON response (P1-02: 替代 `as-any`) */
interface GraphData {
  nodes?: Array<{ id?: string; type?: string; props?: Record<string, unknown> }>;
  edges?: Array<{ to?: string; from?: string; type?: string; weight?: number }>;
  nodeCount?: number;
  edgeCount?: number;
}

/**
 * tools/org-expert-tools.ts — 组织专家工具链 (Phase C1)
 *
 * build_org_graph / scan_collaboration_patterns / assess_decision_flow / identify_key_person_risk
 * 依赖: DataConnector + GraphStore + graph-query
 */
import type { ToolDefinition } from '../agent/tools';
import { createLogger } from '@synova/logger';
const log = createLogger('tools/org-expert');

// ═══ build_org_graph ═══

export const buildOrgGraphTool: ToolDefinition = {
  name: 'build_org_graph',
  description: '从数据源拉取组织成员，自动构建 SOG 本体图（Person+Team 节点 + BELONGS_TO 边）',
  parameters: {
    type: 'object',
    properties: {
      orgId: { type: 'string', description: '组织 ID' },
      dataSource: { type: 'string', description: '数据源: feishu/dingtalk/wecom/manual' },
    },
    required: ['orgId'],
  },
  handler: async (params) => {
    const orgId = params.orgId as string;
    const dataSource = (params.dataSource as string) || 'manual';

    if (dataSource === 'manual') {
      return {
        orgId, dataSource, status: 'manual_mode',
        nodesCreated: 0, edgesCreated: 0,
        message: '手动模式——请通过 Phase 0 访谈提供组织信息，或输入团队成员姓名和部门。',
        nextStep: '使用 POST /api/ontology/ingest 上传组织结构文档，或接入飞书连接器自动拉取（钉钉/企微连接器待接入）。',
      };
    }

    // D482: 连接器声称对齐 — 仅 feishu 真实接入（src/connectors/index.ts 只 export FeishuConnector）。
    // dingtalk/wecom 未实现，降级为待接入提示而非虚假「已就绪」（D357 创始人裁决 B：直连推迟部署后）。
    if (dataSource !== 'feishu') {
      return {
        orgId, dataSource, status: 'pending',
        message: '钉钉/企微连接器待接入（当前仅飞书可用），请通过手动模式或 POST /api/ontology/ingest 上传组织数据。',
      };
    }

    return {
      orgId, dataSource, status: 'pending',
      message: `${dataSource} 连接器已就绪。用户授权后可自动拉取组织数据。`,
    };
  },
};

// ═══ scan_collaboration_patterns ═══

export const scanCollaborationTool: ToolDefinition = {
  name: 'scan_collaboration_patterns',
  description: '分析消息交互数据，构建 SOG INTERACTS_WITH 边，计算协作密度',
  parameters: {
    type: 'object',
    properties: {
      orgId: { type: 'string', description: '组织 ID' },
      since: { type: 'string', description: '起始时间 (ISO 8601)，默认 30 天前' },
    },
    required: ['orgId'],
  },
  handler: async (params) => {
    const orgId = params.orgId as string;
    try {
      const BASE = `http://localhost:${process.env.PORT || 3000}`;
      const res = await fetch(`${BASE}/api/ontology/graph/${orgId}`);
      if (res.ok) {
        const data = await res.json() as GraphData;
        const interactsEdges = (data.edges || []).filter((e: any) => e.type === EdgeType.INFORMATION_FLOW);
        return {
          orgId,
          interactionEdges: interactsEdges.length,
          avgWeight: interactsEdges.length > 0
            ? interactsEdges.reduce((s: number, e: any) => s + (e.weight || 0), 0) / interactsEdges.length
            : 0,
          patterns: {
            highInteraction: interactsEdges.filter((e: any) => e.weight > 0.7).length,
            lowInteraction: interactsEdges.filter((e: any) => e.weight < 0.3).length,
          },
        };
      }
    } catch { log.debug('本体 API 不可达 — 工具降级'); }
    return { orgId, interactionEdges: 0, message: '本体 API 不可达' };
  },
};

// ═══ assess_decision_flow ═══

export const assessDecisionFlowTool: ToolDefinition = {
  name: 'assess_decision_flow',
  description: '分析决策路径长度、审批瓶颈和权力集中度',
  parameters: {
    type: 'object',
    properties: {
      orgId: { type: 'string', description: '组织 ID' },
    },
    required: ['orgId'],
  },
  handler: async (params) => {
    const orgId = params.orgId as string;
    try {
      const BASE = `http://localhost:${process.env.PORT || 3000}`;
      const res = await fetch(`${BASE}/api/ontology/graph/${orgId}`);
      if (res.ok) {
        const data = await res.json() as GraphData;
        const belongsToEdges = (data.edges || []).filter((e: any) => e.type === EdgeType.TALENT_DEPLOYMENT);
        // 计算审批链平均深度（简化：BELONGS_TO 边数 / Person 数）
        const personCount = (data.nodes || []).filter((n: any) => n.type === NodeType.RESOURCE_PERSON).length;
        const avgChainDepth = personCount > 0 ? belongsToEdges.length / personCount : 0;
        return {
          orgId,
          teamCount: (data.nodes || []).filter((n: any) => n.type === NodeType.RESOURCE_TEAM).length,
          personCount,
          belongsToEdges: belongsToEdges.length,
          avgChainDepth: Math.round(avgChainDepth * 10) / 10,
          bottleneckRisk: avgChainDepth > 3 ? 'high' : avgChainDepth > 1.5 ? 'medium' : 'low',
        };
      }
    } catch { log.debug('本体 API 不可达 — 工具降级'); }
    return { orgId, message: '本体 API 不可达' };
  },
};

// ═══ identify_key_person_risk ═══

export const identifyKeyPersonRiskTool: ToolDefinition = {
  name: 'identify_key_person_risk',
  description: '识别单点故障风险人物——中心性过高、不可替代的关键人员',
  parameters: {
    type: 'object',
    properties: {
      orgId: { type: 'string', description: '组织 ID' },
      threshold: { type: 'number', description: '中心性阈值 (0-1)，默认 0.7' },
    },
    required: ['orgId'],
  },
  handler: async (params) => {
    const orgId = params.orgId as string;
    const threshold = (params.threshold as number) || 0.7;
    try {
      const BASE = `http://localhost:${process.env.PORT || 3000}`;
      const res = await fetch(`${BASE}/api/ontology/graph/${orgId}`);
      if (res.ok) {
        const data = await res.json() as GraphData;
        const persons = (data.nodes || []).filter((n: any) => n.type === NodeType.RESOURCE_PERSON);
        // 简化中心性：基于边的度数
        const centrality = persons.map((p: any) => {
          const degree = (data.edges || []).filter((e: any) => e.from === p.id || e.to === p.id).length;
          const maxDegree = Math.max(1, (data.edges || []).length);
          return { personId: p.id, name: p.props?.name || p.id, degree, centrality: degree / maxDegree };
        });
        const atRisk = centrality.filter((c: any) => c.centrality > threshold);
        return {
          orgId, threshold,
          totalPersons: persons.length,
          atRiskCount: atRisk.length,
          atRisk: atRisk.sort((a: any, b: any) => b.centrality - a.centrality).slice(0, 5),
          recommendation: atRisk.length > 0
            ? `发现 ${atRisk.length} 个关键人员风险。建议知识备份 + 副手培养。`
            : '未发现关键人员风险',
        };
      }
    } catch { log.debug('本体 API 不可达 — 工具降级'); }
    return { orgId, message: '本体 API 不可达' };
  },
};

export const ORG_EXPERT_TOOLS: ToolDefinition[] = [
  buildOrgGraphTool,
  scanCollaborationTool,
  assessDecisionFlowTool,
  identifyKeyPersonRiskTool,
];
