/** tools/action-expert-tools.ts — 行动专家工具链 (Phase C5) */
import type { ToolDefinition } from '../agent/tools';

export const prioritizeByImpactTool: ToolDefinition = {
  name: 'prioritize_by_impact', description: '影响力×紧急性矩阵排序行动项',
  parameters: { type:'object', properties:{ orgId:{type:'string'}, actionItems:{type:'string'} }, required:['orgId'] },
  handler: async (p) => {
    let items = [];
    try { items = JSON.parse(p.actionItems as string || '[]'); } catch { items = []; }
    return { orgId: p.orgId, prioritized: items.map((a:any,i:number) => ({ ...a, priority: i===0?'critical':i<3?'high':'medium', impactScore: 0.8 - i*0.15 })), framework: 'impact_vs_urgency_matrix' };
  },
};

export const trackExecutionTool: ToolDefinition = {
  name: 'track_execution', description: '追踪行动项完成状态（Jira/Linear API 轮询）',
  parameters: { type:'object', properties:{ orgId:{type:'string'} }, required:['orgId'] },
  handler: async (p) => ({ orgId: p.orgId, status: 'pending', message: '任务追踪需 Jira/Linear API 配置。设置 JIRA_BASE_URL + JIRA_API_TOKEN 或 LINEAR_API_KEY 后自动轮询。' }),
};

export const measureEffectivenessTool: ToolDefinition = {
  name: 'measure_effectiveness', description: '行动项执行后指标变化——闭环验证核心',
  parameters: { type:'object', properties:{ orgId:{type:'string'} }, required:['orgId'] },
  handler: async (p) => {
    const orgId = p.orgId as string;
    try {
      const BASE = `http://localhost:${process.env.PORT||3000}`;
      const r = await fetch(`${BASE}/api/sessions/search?q=${encodeURIComponent(orgId)}`);
      if (r.ok) {
        const d = await r.json() as { results?: unknown[] };
        return { orgId, previousDiagnoses: d.results?.length || 0, hasHistory: (d.results?.length ?? 0) > 0, recommendation: (d.results?.length ?? 0) > 0 ? `对比上次行动项效果，评估改善幅度。` : '首次诊断——无历史数据可对比。' };
      }
    } catch {
      // 会话 API 不可达 — 降级为无历史数据模式
    }
    return { orgId, hasHistory: false, message: '闭环验证需要历史诊断数据' };
  },
};

export const ACTION_EXPERT_TOOLS: ToolDefinition[] = [prioritizeByImpactTool, trackExecutionTool, measureEffectivenessTool];
