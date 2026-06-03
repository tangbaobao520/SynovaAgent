/** tools/marketing-expert-tools.ts — 营销专家工具链 (Phase C6) */
import type { ToolDefinition } from '../agent/tools';

export const collectPositioningDataTool: ToolDefinition = {
  name: 'collect_positioning_data', description: '采集客户定位数据——激活 3 个存根模块',
  parameters: { type:'object', properties:{ orgId:{type:'string'} }, required:['orgId'] },
  handler: async (p) => ({
    orgId: p.orgId, status: 'interview_required',
    questions: ['你的三个主要竞争对手是谁？','客户选择你的首要原因是什么？','你如何描述自己的差异化？','目标客户画像是什么？'],
    note: '此数据将激活 category-clarity / positioning-consistency / differentiation-validation 三个诊断模块。',
  }),
};

export const competitiveLandscapeTool: ToolDefinition = {
  name: 'competitive_landscape', description: '竞品矩阵：功能/价格/目标客户/差异化',
  parameters: { type:'object', properties:{ orgId:{type:'string'}, competitors:{type:'string'} }, required:['orgId'] },
  handler: async (p) => {
    let comps = [];
    try { comps = JSON.parse(p.competitors as string || '[]'); } catch { comps = []; }
    return { orgId: p.orgId, competitors: comps.length > 0 ? comps : [{ name:'竞品A', features:'待填写', price:'待填写' }, { name:'竞品B', features:'待填写', price:'待填写' }], matrix: '待 Phase 0 访谈填充', recommendation: '提供竞品信息后可生成完整竞品矩阵。' };
  },
};

export const goToMarketAuditTool: ToolDefinition = {
  name: 'go_to_market_audit', description: '渠道效率、获客成本、转化漏斗评估',
  parameters: { type:'object', properties:{ orgId:{type:'string'} }, required:['orgId'] },
  handler: async (p) => ({ orgId: p.orgId, channels: ['直销', '渠道合作', '线上营销', '内容营销'], questions: ['各渠道获客成本？','转化率？','客户生命周期价值？'], status: 'interview_required' }),
};

export const MARKETING_EXPERT_TOOLS: ToolDefinition[] = [collectPositioningDataTool, competitiveLandscapeTool, goToMarketAuditTool];
