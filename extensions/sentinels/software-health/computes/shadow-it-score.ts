/**
 * software-health/computes/shadow-it-score.ts — 影子 IT 检测评分
 *
 * 评估 TOOL/APP 节点的授权合规性。
 * 纯函数：输入工具列表，输出影子IT指标。
 */
export interface ShadowItResult {
  unauthorizedRate: number;   // 未授权/未知比例 (0-1)
  authorizedCount: number;
  unauthorizedCount: number;
  highRiskUnauthorized: string[];
  totalTools: number;
  degraded: boolean;
}

export interface ToolAuthItem {
  id: string;
  name: string;
  authorized: boolean;
  category: string;
}

const HIGH_RISK_CATEGORIES = ['file_sharing', 'communication', 'project_management', 'note_taking', 'cloud_storage', 'ai_tool'];

export function computeShadowItScore(tools: ToolAuthItem[]): ShadowItResult {
  if (tools.length === 0) {
    return { unauthorizedRate: 0, authorizedCount: 0, unauthorizedCount: 0, highRiskUnauthorized: [], totalTools: 0, degraded: true };
  }

  const authorized = tools.filter(t => t.authorized);
  const unauthorized = tools.filter(t => !t.authorized);
  const unauthorizedRate = unauthorized.length / tools.length;

  const highRiskUnauthorized = unauthorized
    .filter(t => HIGH_RISK_CATEGORIES.some(cat => t.category.toLowerCase().includes(cat)))
    .map(t => t.name);

  return {
    unauthorizedRate,
    authorizedCount: authorized.length,
    unauthorizedCount: unauthorized.length,
    highRiskUnauthorized,
    totalTools: tools.length,
    degraded: false,
  };
}
