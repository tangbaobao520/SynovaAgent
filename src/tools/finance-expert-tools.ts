/** tools/finance-expert-tools.ts — 财务专家工具链 (Phase C4) */
import type { ToolDefinition } from '../agent/tools';

export const collectCostDataTool: ToolDefinition = {
  name: 'collect_cost_data', description: '采集成本结构数据（人力/基础设施/SaaS/营销）',
  parameters: { type:'object', properties:{ orgId:{type:'string'} }, required:['orgId'] },
  handler: async (p) => ({ orgId: p.orgId, status: 'interview_required', categories: ['人力成本 (工资/福利)', '基础设施 (云服务/服务器)', 'SaaS 订阅 (工具/软件)', '营销 (广告/内容)'], message: '请通过 Phase 0 访谈提供各成本类别的月度/年度金额。' }),
};

export const assessRevenueQualityTool: ToolDefinition = {
  name: 'assess_revenue_quality', description: '收入集中度、客户留存率、回款周期',
  parameters: { type:'object', properties:{ orgId:{type:'string'} }, required:['orgId'] },
  handler: async (p) => ({ orgId: p.orgId, status: 'interview_required', questions: ['最大客户占总收入比例？','年度客户留存率？','平均回款周期（天）？','收入增长率（YoY）？'] }),
};

export const roiProjectionTool: ToolDefinition = {
  name: 'roi_projection', description: '对诊断建议预估 ROI 和回收期',
  parameters: { type:'object', properties:{ orgId:{type:'string'} }, required:['orgId'] },
  handler: async (p) => ({ orgId: p.orgId, projections: [{ action: '部署 CI/CD 自动化', estimatedCost: '5人天 + $50/月', estimatedSaving: '20人天/月', roi: '380%', paybackMonths: 1.5 }, { action: '团队协作工具统一', estimatedCost: '$15/人/月', estimatedSaving: '减少30%沟通损耗', roi: '200%', paybackMonths: 2 }], note: '以上为通用估算。提供实际成本数据后重新计算。' }),
};

export const FINANCE_EXPERT_TOOLS: ToolDefinition[] = [collectCostDataTool, assessRevenueQualityTool, roiProjectionTool];
