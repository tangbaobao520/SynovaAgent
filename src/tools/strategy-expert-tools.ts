/** tools/strategy-expert-tools.ts — 战略专家工具链 (Phase C3) */
import type { ToolDefinition } from '../agent/tools';

const getGraph = async (orgId: string) => {
  try { const r = await fetch(`http://localhost:${process.env.PORT||3000}/api/ontology/graph/${orgId}`); return r.ok ? r.json() : null; } catch { return null; }
};

export const scanIndustryLandscapeTool: ToolDefinition = {
  name: 'scan_industry_landscape', description: '识别行业分类、市场规模、主要玩家',
  parameters: { type:'object', properties:{ orgId:{type:'string'}, industry:{type:'string'} }, required:['orgId'] },
  handler: async (p) => ({ orgId: p.orgId, industry: p.industry || '待确认', status: 'interview_required', message: '请通过 Phase 0 访谈提供: 行业、主要竞争对手、目标市场规模。' }),
};

export const assessCompetitivePositionTool: ToolDefinition = {
  name: 'assess_competitive_position', description: '对比同行：团队规模、技术栈、增长速度',
  parameters: { type:'object', properties:{ orgId:{type:'string'} }, required:['orgId'] },
  handler: async (p) => {
    const g = await getGraph(p.orgId as string);
    const pc = g ? (g.nodes||[]).filter((n:any)=>n.type==='Person').length : 0;
    return { orgId: p.orgId, teamSize: pc, benchmark: pc < 10 ? 'seed' : pc < 50 ? 'early' : pc < 200 ? 'growth' : 'scale', recommendation: '需要竞品数据以完成对比分析。可通过访谈或 Crunchbase API 获取。' };
  },
};

export const analyzeBusinessModelTool: ToolDefinition = {
  name: 'analyze_business_model', description: '收入结构、成本驱动、盈利模式可持续性',
  parameters: { type:'object', properties:{ orgId:{type:'string'} }, required:['orgId'] },
  handler: async (p) => ({ orgId: p.orgId, status: 'interview_required', questions: ['主要收入来源是什么？','客户留存率是多少？','最大的成本项是什么？','盈利模式是否可持续？'] }),
};

export const strategicRiskRadarTool: ToolDefinition = {
  name: 'strategic_risk_radar', description: '四象限风险矩阵：市场/技术/组织/财务',
  parameters: { type:'object', properties:{ orgId:{type:'string'} }, required:['orgId'] },
  handler: async (p) => {
    const g = await getGraph(p.orgId as string);
    const risks = g ? (g.nodes||[]).filter((n:any)=>n.type==='Risk').length : 0;
    return { orgId: p.orgId, quadrants: { market: risks>0?'medium':'unknown', technology: risks>1?'high':'medium', organizational: risks>0?'low':'unknown', financial: 'unknown' }, recommendation: risks===0 ? '未发现已记录的风险节点。建议运行完整诊断后生成风险雷达。' : `已识别 ${risks} 个风险项。` };
  },
};

export const STRATEGY_EXPERT_TOOLS: ToolDefinition[] = [scanIndustryLandscapeTool, assessCompetitivePositionTool, analyzeBusinessModelTool, strategicRiskRadarTool];
