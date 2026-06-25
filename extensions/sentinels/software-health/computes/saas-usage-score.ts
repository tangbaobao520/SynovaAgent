/**
 * software-health/computes/saas-usage-score.ts — SaaS 利用率评分
 *
 * 评估 TOOL/APP 节点的活跃使用率与类别重叠度。
 * 纯函数：输入工具列表，输出利用率指标。
 */
export interface UsageScoreResult {
  usageRate: number;          // 在用工具比例 (0-1)
  activeCount: number;
  idleCount: number;
  overlappingCategories: Array<{ category: string; toolCount: number; toolNames: string[] }>;
  totalTools: number;
  degraded: boolean;
}

export interface ToolItem {
  id: string;
  name: string;
  status: string;
  category: string;
}

export function computeSaasUsageScore(tools: ToolItem[]): UsageScoreResult {
  if (tools.length === 0) {
    return { usageRate: 1, activeCount: 0, idleCount: 0, overlappingCategories: [], totalTools: 0, degraded: true };
  }

  const active = tools.filter(t => t.status === 'active' || t.status === 'in_use');
  const idle = tools.filter(t => t.status === 'idle' || t.status === 'unused' || t.status === 'unknown');
  const usageRate = tools.length > 0 ? active.length / tools.length : 0;

  // 按类别分组检测重叠
  const catMap = new Map<string, string[]>();
  for (const t of tools) {
    const list = catMap.get(t.category) || [];
    list.push(t.name);
    catMap.set(t.category, list);
  }
  const overlappingCategories = [...catMap.entries()]
    .filter(([_, names]) => names.length >= 3)
    .map(([category, toolNames]) => ({ category, toolCount: toolNames.length, toolNames }));

  return { usageRate, activeCount: active.length, idleCount: idle.length, overlappingCategories, totalTools: tools.length, degraded: false };
}
