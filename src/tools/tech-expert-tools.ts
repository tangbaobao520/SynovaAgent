import { SOGNodeType, SOGEdgeType } from '@synova/sog-core';
/**
 * tools/tech-expert-tools.ts — 技术专家工具链 (Phase C2)
 */
import type { ToolDefinition } from '../agent/tools';
import { createLogger } from '@synova/logger';
const log = createLogger('tools/tech-expert');

export const scanSoftwareEcosystemTool: ToolDefinition = {
  name: 'scan_software_ecosystem',
  description: '扫描组织当前使用的软件工具清单，构建 SOG TOOL 节点层级图',
  parameters: { type: 'object', properties: { orgId: { type: 'string' } }, required: ['orgId'] },
  handler: async (params) => {
    const orgId = params.orgId as string;
    try {
      const BASE = `http://localhost:${process.env.PORT || 3000}`;
      const res = await fetch(`${BASE}/api/ontology/graph/${orgId}`);
      if (res.ok) {
        const data = await res.json() as { nodes?: Array<{ type?: string; props?: Record<string, unknown> }> };
        const tools = (data.nodes || []).filter(n => n.type === SOGNodeType.TOOL);
        return { orgId, toolCount: tools.length, tools: tools.map(t => ({ name: t.props?.name, category: t.props?.category })), recommendation: tools.length === 0 ? '未发现工具节点。请通过 Phase 0 访谈或 API 录入使用的软件工具。' : `已识别 ${tools.length} 个工具。` };
      }
    } catch { log.debug('本体 API 不可达 — 工具降级'); }
    return { orgId, toolCount: 0, recommendation: '通过访谈或 API 录入软件工具清单' };
  },
};

export const analyzeCodeHealthTool: ToolDefinition = {
  name: 'analyze_code_health', description: '分析代码仓库健康度（需 GitHub/GitLab 授权）',
  parameters: { type: 'object', properties: { orgId: { type: 'string' }, repoUrl: { type: 'string' } }, required: ['orgId'] },
  handler: async (params) => ({
    orgId: params.orgId, status: 'pending',
    message: '代码健康分析需 GitHub/GitLab API 授权。授权后自动拉取提交频率、PR审查时间、技术债热点。',
    setupGuide: '设置 GITHUB_TOKEN 环境变量或在对话中输入仓库 URL。',
  }),
};

export const assessAiMaturityTool: ToolDefinition = {
  name: 'assess_ai_maturity', description: '评估组织 AI 成熟度——工具使用、自动化程度、技能缺口',
  parameters: { type: 'object', properties: { orgId: { type: 'string' } }, required: ['orgId'] },
  handler: async (params) => {
    const orgId = params.orgId as string;
    try {
      const BASE = `http://localhost:${process.env.PORT || 3000}`;
      const res = await fetch(`${BASE}/api/ontology/graph/${orgId}`);
      if (res.ok) {
        const data = await res.json() as { nodes?: Array<{ type?: string; props?: Record<string, unknown> }> };
        const agents = (data.nodes || []).filter(n => n.type === SOGNodeType.AGENT);
        const tools = (data.nodes || []).filter(n => n.type === SOGNodeType.TOOL);
        return { orgId, agentCount: agents.length, toolCount: tools.length, maturityLevel: agents.length > 0 ? 'intermediate' : 'beginner', recommendation: agents.length === 0 ? '建议从部署一个内部 AI Agent 开始（如代码审查助手）。' : `已有 ${agents.length} 个 Agent 在运行。建议定期评估效果。` };
      }
    } catch { log.debug('本体 API 不可达 — 工具降级'); }
    return { orgId, maturityLevel: 'unknown', recommendation: '请通过 Phase 0 访谈描述当前 AI 使用情况' };
  },
};

export const recommendTechStackTool: ToolDefinition = {
  name: 'recommend_tech_stack', description: '基于当前工具链和行业基准，推荐技术方案',
  parameters: { type: 'object', properties: { orgId: { type: 'string' }, budget: { type: 'string' } }, required: ['orgId'] },
  handler: async (params) => {
    const orgId = params.orgId as string;
    return { orgId, recommendations: [{ category: 'CI/CD', suggestion: 'GitHub Actions 或 GitLab CI', roi: '减少手动部署时间 80%' }, { category: '监控', suggestion: 'Grafana + Prometheus', roi: '故障发现时间从小时降至分钟' }, { category: 'AI', suggestion: 'GitHub Copilot 或 Cursor', roi: '开发效率提升 30-50%' }], note: '以上为通用建议。完整诊断后提供定制方案。' };
  },
};

export const TECH_EXPERT_TOOLS: ToolDefinition[] = [scanSoftwareEcosystemTool, analyzeCodeHealthTool, assessAiMaturityTool, recommendTechStackTool];
