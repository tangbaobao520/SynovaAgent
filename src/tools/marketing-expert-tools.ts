/** tools/marketing-expert-tools.ts — 营销专家工具链 (数据源: 文档提取 + 连接器) */
import type { ToolDefinition } from '../agent/tools';
import { SOGNodeType } from '@synova/sog-core';
import { createLogger } from '../logger';
const log = createLogger('tools/marketing-expert');

interface GraphData { nodes?: Array<{ type: string; props?: Record<string, unknown> }>; }
const getGraph = async (orgId: string): Promise<GraphData | null> => {
  try { const r = await fetch(`http://localhost:${process.env.PORT || 3000}/api/ontology/graph/${orgId}`); return r.ok ? await r.json() as GraphData : null; } catch { log.debug('本体 API 不可达 — 返回 null'); return null; }
};

export const collectPositioningDataTool: ToolDefinition = {
  name: 'collect_positioning_data', description: '从 SOG 图分析市场定位线索 (GOAL/CLIENT/CAPABILITY 节点)',
  parameters: { type:'object', properties:{ orgId:{type:'string'} }, required:['orgId'] },
  handler: async (p) => {
    const g = await getGraph(p.orgId as string);
    const goals = g ? (g.nodes || []).filter((n: any) => n.type === SOGNodeType.GOAL) : [];
    const clients = g ? (g.nodes || []).filter((n: any) => n.type === SOGNodeType.CLIENT) : [];
    const capabilities = g ? (g.nodes || []).filter((n: any) => n.type === SOGNodeType.CAPABILITY) : [];
    return {
      orgId: p.orgId, status: goals.length > 0 ? 'ok' : 'limited',
      goals: goals.length, clients: clients.length, capabilities: capabilities.length,
      positioningHints: goals.slice(0, 3).map((g: any) => g.props?.description || g.props?.name),
      note: '此数据激活 category-clarity / positioning-consistency / differentiation-validation 诊断模块。',
    };
  },
};

export const competitiveLandscapeTool: ToolDefinition = {
  name: 'competitive_landscape', description: '基于 SOG 图生成竞品矩阵',
  parameters: { type:'object', properties:{ orgId:{type:'string'} }, required:['orgId'] },
  handler: async (p) => {
    let comps: Array<{ name: string; features: string; price: string }> = [];
    try { comps = JSON.parse(p.competitors as string || '[]'); } catch { log.debug('competitors JSON 解析失败 — 使用空数组'); comps = []; }
    const g = await getGraph(p.orgId as string);
    const persons = g ? (g.nodes || []).filter((n: any) => n.type === SOGNodeType.PERSON).length : 0;
    const teams = g ? (g.nodes || []).filter((n: any) => n.type === SOGNodeType.TEAM).length : 0;
    return {
      orgId: p.orgId, teamSize: persons, teamCount: teams,
      competitors: comps.length > 0 ? comps : [{ name: '竞品A', features: '待填写', price: '待填写' }],
      matrix: comps.length > 0 ? '已提供竞品数据' : `基于 ${persons}人/${teams}团队规模，建议补充竞品信息`,
    };
  },
};

export const goToMarketAuditTool: ToolDefinition = {
  name: 'go_to_market_audit', description: '从 SOG 图分析渠道和流程效率 (PROCESS + CLIENT 节点)',
  parameters: { type:'object', properties:{ orgId:{type:'string'} }, required:['orgId'] },
  handler: async (p) => {
    const g = await getGraph(p.orgId as string);
    const processes = g ? (g.nodes || []).filter((n: any) => n.type === SOGNodeType.PROCESS) : [];
    const clients = g ? (g.nodes || []).filter((n: any) => n.type === SOGNodeType.CLIENT) : [];
    return {
      orgId: p.orgId, status: processes.length > 0 ? 'ok' : 'limited',
      processCount: processes.length, clientCount: clients.length,
      channels: ['直销', '渠道合作', '线上营销', '内容营销'],
      hint: processes.length === 0 ? 'SOG 中无 PROCESS 节点。上传含流程描述的文档后自动填充。' : undefined,
    };
  },
};

export const MARKETING_EXPERT_TOOLS: ToolDefinition[] = [collectPositioningDataTool, competitiveLandscapeTool, goToMarketAuditTool];
