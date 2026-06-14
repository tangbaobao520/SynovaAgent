/** tools/strategy-expert-tools.ts — 战略专家工具链 (数据源: 文档提取 + 连接器) */
import type { ToolDefinition } from '../agent/tools';
import { SOGNodeType } from '@synova/sog-core';
import { createLogger } from '../logger';
const log = createLogger('tools/strategy-expert');

interface GraphData { nodes?: Array<{ type: string; props?: Record<string, unknown> }>; }
const getGraph = async (orgId: string): Promise<GraphData | null> => {
  try { const r = await fetch(`http://localhost:${process.env.PORT || 3000}/api/ontology/graph/${orgId}`); return r.ok ? await r.json() as GraphData : null; } catch { log.debug('本体 API 不可达 — 返回 null'); return null; }
};

export const scanIndustryLandscapeTool: ToolDefinition = {
  name: 'scan_industry_landscape', description: '从 SOG 图识别行业分类、规模和关键玩家 (GOAL/CLIENT/TEAM)',
  parameters: { type:'object', properties:{ orgId:{type:'string'} }, required:['orgId'] },
  handler: async (p) => {
    const g = await getGraph(p.orgId as string);
    const goals = g ? (g.nodes || []).filter((n: any) => n.type === SOGNodeType.GOAL) : [];
    const clients = g ? (g.nodes || []).filter((n: any) => n.type === SOGNodeType.CLIENT) : [];
    const teams = g ? (g.nodes || []).filter((n: any) => n.type === SOGNodeType.TEAM) : [];
    const industryTerms = goals.map((g: any) => g.props?.description || '').join(' ').toLowerCase();
    return {
      orgId: p.orgId, status: goals.length > 0 ? 'ok' : 'limited',
      goals: goals.length, clients: clients.length, teams: teams.length,
      industry: p.industry || (industryTerms.includes('saas') ? 'SaaS' : industryTerms.includes('制造') ? '制造业' : '待确认'),
      hint: goals.length === 0 ? 'SOG 中无 GOAL 节点。上传战略文档或完成访谈后自动填充。' : undefined,
    };
  },
};

export const assessCompetitivePositionTool: ToolDefinition = {
  name: 'assess_competitive_position', description: '基于 SOG 数据对比行业基准 (PERSON/TEAM/TOOL)',
  parameters: { type:'object', properties:{ orgId:{type:'string'} }, required:['orgId'] },
  handler: async (p) => {
    const g = await getGraph(p.orgId as string);
    const pc = g ? (g.nodes || []).filter((n: any) => n.type === SOGNodeType.PERSON).length : 0;
    const tc = g ? (g.nodes || []).filter((n: any) => n.type === SOGNodeType.TEAM).length : 0;
    const toolc = g ? (g.nodes || []).filter((n: any) => n.type === SOGNodeType.TOOL).length : 0;
    return {
      orgId: p.orgId, teamSize: pc, teamCount: tc, toolCount: toolc,
      benchmark: pc < 10 ? 'seed' : pc < 50 ? 'early' : pc < 200 ? 'growth' : 'scale',
      dataSource: `SOG 图: ${pc}人 ${tc}团队 ${toolc}工具`,
    };
  },
};

export const analyzeBusinessModelTool: ToolDefinition = {
  name: 'analyze_business_model', description: '从 SOG 图分析收入/成本/盈利数据 (FINANCIAL + CLIENT + GOAL)',
  parameters: { type:'object', properties:{ orgId:{type:'string'} }, required:['orgId'] },
  handler: async (p) => {
    const g = await getGraph(p.orgId as string);
    const financials = g ? (g.nodes || []).filter((n: any) => n.type === SOGNodeType.FINANCIAL) : [];
    const clients = g ? (g.nodes || []).filter((n: any) => n.type === SOGNodeType.CLIENT) : [];
    const goals = g ? (g.nodes || []).filter((n: any) => n.type === SOGNodeType.GOAL) : [];
    const revenueData = financials.filter((f: any) => f.props?.financialType === 'revenue');
    return {
      orgId: p.orgId, status: financials.length > 0 ? 'ok' : 'limited',
      revenueSources: revenueData.length, clientCount: clients.length, goals: goals.length,
      hint: financials.length === 0 ? 'SOG 中无 FINANCIAL 节点。上传含财务数据的文档后自动填充。' : undefined,
    };
  },
};

export const strategicRiskRadarTool: ToolDefinition = {
  name: 'strategic_risk_radar', description: '基于 SOG 图生成四象限风险矩阵 (RISK/GOAL/COMPLIANCE)',
  parameters: { type:'object', properties:{ orgId:{type:'string'} }, required:['orgId'] },
  handler: async (p) => {
    const g = await getGraph(p.orgId as string);
    const risks = g ? (g.nodes || []).filter((n: any) => n.type === SOGNodeType.RISK) : [];
    const goals = g ? (g.nodes || []).filter((n: any) => n.type === SOGNodeType.GOAL) : [];
    const complianceItems = g ? (g.nodes || []).filter((n: any) => n.type === SOGNodeType.COMPLIANCE) : [];
    const riskLevels = risks.map((r: any) => r.props?.severity || 'medium');
    return {
      orgId: p.orgId,
      quadrants: {
        market: riskLevels.includes('high') ? 'high' : risks.length > 0 ? 'medium' : 'unknown',
        technology: riskLevels.filter((r: string) => r === 'high' || r === 'critical').length > 0 ? 'high' : 'medium',
        organizational: goals.length > 5 ? 'low' : 'medium',
        financial: complianceItems.length > 0 ? 'medium' : 'unknown',
      },
      riskCount: risks.length, goalCount: goals.length,
      hint: risks.length === 0 ? '未发现已记录的风险节点。接入连接器或完成诊断后自动生成。' : undefined,
    };
  },
};

export const STRATEGY_EXPERT_TOOLS: ToolDefinition[] = [scanIndustryLandscapeTool, assessCompetitivePositionTool, analyzeBusinessModelTool, strategicRiskRadarTool];
