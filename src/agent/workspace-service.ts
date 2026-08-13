/**
 * workspace-service.ts — 工作区业务逻辑 (L2, PRD v1.6 Slice 7)
 *
 * 子工作区创建 / 上下文继承 / 冲突检测
 *
 * @deprecated — D74 工作台数据聚合 (workspace-builder.ts) 已替代此模块。
 *   旧代码保留不动，D77b 时统一删除。不修改此文件。
 */
import { createLogger } from '@synova/logger';

const log = createLogger('agent/workspace-service');

export interface SubWorkspaceRequest {
  parentId: string;
  department: string;
  title: string;
  source: 'agent_suggested' | 'boss_assigned';
  parentSummary: string;
}

export function buildInheritedContext(req: SubWorkspaceRequest): string {
  const suggestions = getDepartmentSuggestions(req.department);
  return `这是从全局方案"${req.parentSummary}"中分配给你的任务。

老板确认的目标和约束已注入。基于你部门的数据，建议先讨论:
${suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n')}

你可以自由讨论和细化方案。确认后的方案将汇入全局视图。`;
}

function getDepartmentSuggestions(dept: string): string[] {
  const suggestions: Record<string, string[]> = {
    marketing: ['竞品价格区间对比', '客户价格敏感度分析', '渠道利润率评估'],
    sales: ['大客户流失风险预警', '销售团队覆盖密度', '新客户获取成本分析'],
    finance: ['现金流压力测试', '成本结构优化方案', 'ROI归因分析'],
    org: ['关键岗位人才盘点', '组织架构优化方案', '跨部门协作效率评估'],
    tech: ['技术债务量化', '数字化成熟度评估', 'Agent审计能力评估'],
    operations: ['供应链效率优化', '库存周转分析', '产能利用率评估'],
  };
  return suggestions[dept] || ['当前部门数据分析', '行业对标评估', '改进方案设计'];
}

export function detectConflicts(workspaces: Array<{
  id: string; department?: string; title: string; status: string;
}>): Array<{ type: string; dimension: string; sources: string[] }> {
  const conflicts: Array<{ type: string; dimension: string; sources: string[] }> = [];
  const confirmed = workspaces.filter(w => w.status === 'confirmed');

  for (let i = 0; i < confirmed.length; i++) {
    for (let j = i + 1; j < confirmed.length; j++) {
      if (confirmed[i].department === confirmed[j].department) continue;
      // 简单启发式: 同关键词 → 潜在冲突
      const wordsA = new Set(confirmed[i].title.split(/[\s·]+/));
      const wordsB = confirmed[j].title.split(/[\s·]+/);
      const overlap = wordsB.filter(w => wordsA.has(w) && w.length > 1);
      if (overlap.length >= 1) {
        conflicts.push({
          type: 'numeric',
          dimension: overlap[0],
          sources: [confirmed[i].id, confirmed[j].id],
        });
      }
    }
  }
  return conflicts;
}

log.info('WorkspaceService 已初始化');
