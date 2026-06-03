/**
 * agent/builtin-tools.ts — 内置工具注册 (Era 2.2)
 *
 * SynovaAgent 对话中可用的 4 个内置工具。
 * 对标 engine-core 的 FDE_TOOLS + agent-tool-registry。
 */
import type { ToolRegistry } from './tools';
import type { SessionStore } from '../store/session-store';
import { ACCURACY_TOOLS, ORG_EXPERT_TOOLS, TECH_EXPERT_TOOLS, STRATEGY_EXPERT_TOOLS, FINANCE_EXPERT_TOOLS, ACTION_EXPERT_TOOLS, MARKETING_EXPERT_TOOLS } from '../tools';
import { createLogger } from '../logger';

const log = createLogger('agent/builtin-tools');

export function registerBuiltinTools(
  registry: ToolRegistry,
  store: SessionStore,
  sessionId: string,
  getPhase: () => number,
  getOrgId: () => string,
): void {
  // ═══ query_ontology ═══
  registry.register({
    name: 'query_ontology',
    description: '查询当前组织的本体图（节点数、边数、实体类型分布）',
    parameters: {
      type: 'object',
      properties: {
        orgId: { type: 'string', description: '组织 ID，默认使用当前诊断组织' },
      },
    },
    handler: async (params) => {
      const orgId = (params.orgId as string) || getOrgId();
      log.info({ orgId }, 'query_ontology 工具调用');
      try {
        const BASE = `http://localhost:${process.env.PORT || 3000}`;
        const res = await fetch(`${BASE}/api/ontology/graph/${orgId}`);
        if (res.ok) {
          const data = await res.json() as any;
          const nodeTypes = [...new Set((data.nodes || []).map((n: any) => n.type))];
          return {
            orgId: data.orgId || orgId,
            nodeCount: data.nodeCount || 0,
            edgeCount: data.edgeCount || 0,
            nodeTypes,
            summary: nodeTypes.length > 0
              ? `本体图包含 ${data.nodeCount} 个节点 (${nodeTypes.join(', ')})、${data.edgeCount} 条边`
              : '本体图当前无数据',
            hint: data.nodeCount === 0 ? '使用 POST /api/ontology/ingest 上传文档来构建本体图' : undefined,
          };
        }
      } catch (err: any) {
        log.warn({ err: err.message }, 'query_ontology API 不可达');
        return { orgId, error: '本体 API 不可达——请确保 SynovaAgent 服务已启动' };
      }
      return { orgId, nodeCount: 0, edgeCount: 0, summary: '本体图当前无数据' };
    },
  });

  // ═══ show_diagnosis_progress ═══
  registry.register({
    name: 'show_diagnosis_progress',
    description: '显示当前诊断的进度（Phase、完成百分比、当前步骤）',
    parameters: {
      type: 'object',
      properties: {},
    },
    handler: async () => {
      const phase = getPhase();
      const labels = ['组织访谈', '数据采集', '假设生成', '根因分析', '报告生成', '交付'];
      return {
        phase,
        label: labels[phase] || `Phase ${phase}`,
        percent: Math.round((phase / 5) * 100),
        totalPhases: 5,
        currentStage: phase === 0 ? '正在通过访谈了解你的组织' : `诊断流水线 Phase ${phase}/5 进行中`,
      };
    },
  });

  // ═══ explain_finding ═══
  registry.register({
    name: 'explain_finding',
    description: '详细解释诊断中的某个发现或假设',
    parameters: {
      type: 'object',
      properties: {
        findingId: { type: 'string', description: '发现 ID 或关键词' },
      },
      required: ['findingId'],
    },
    handler: async (params) => {
      const findingId = params.findingId as string;
      // 搜索会话历史中匹配的消息
      const msgs = store.getMessages(sessionId);
      const related = msgs.filter(m =>
        m.content.toLowerCase().includes(findingId.toLowerCase())
      ).slice(-5);
      if (related.length > 0) {
        return {
          findingId,
          explanation: `在会话历史中找到 ${related.length} 条相关内容`,
          relatedMessages: related.map(m => ({ role: m.role, content: m.content.slice(0, 300), timestamp: m.timestamp })),
          suggestion: '可运行完整诊断获取更详细的分析',
        };
      }
      // 搜索所有历史会话
      const searchResults = store.search(findingId, 5);
      if (searchResults.length > 0) {
        return {
          findingId,
          explanation: `在历史诊断中找到 ${searchResults.length} 条相关内容`,
          relatedSessions: searchResults.map(r => ({ orgId: r.orgId, snippet: r.snippet, updatedAt: r.updatedAt })),
          suggestion: '可查看历史诊断获取详细分析',
        };
      }
      return {
        findingId,
        explanation: `未找到与"${findingId}"相关的历史诊断数据`,
        suggestion: '配置 LLM_API_KEY 并运行诊断获取详细分析',
      };
    },
  });

  // ═══ list_sessions ═══
  registry.register({
    name: 'list_sessions',
    description: '列出历史诊断会话',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: '返回数量，默认 5' },
      },
    },
    handler: async (params) => {
      const limit = (params.limit as number) || 5;
      const sessions = store.listSessions(limit);
      return {
        sessions: sessions.map(s => ({
          id: s.id,
          orgId: s.orgId,
          phase: s.phase,
          updatedAt: s.updatedAt,
        })),
        total: sessions.length,
      };
    },
  });

  // Phase B: 注册共享准确率工具
  for (const tool of ACCURACY_TOOLS) {
    registry.register(tool);
  }
  // Phase C: 注册全部专家工具链
  for (const t of ORG_EXPERT_TOOLS) registry.register(t);
  for (const t of TECH_EXPERT_TOOLS) registry.register(t);
  for (const t of STRATEGY_EXPERT_TOOLS) registry.register(t);
  for (const t of FINANCE_EXPERT_TOOLS) registry.register(t);
  for (const t of ACTION_EXPERT_TOOLS) registry.register(t);
  for (const t of MARKETING_EXPERT_TOOLS) registry.register(t);
  log.info({ total: ACCURACY_TOOLS.length + ORG_EXPERT_TOOLS.length + TECH_EXPERT_TOOLS.length + STRATEGY_EXPERT_TOOLS.length + FINANCE_EXPERT_TOOLS.length + ACTION_EXPERT_TOOLS.length + MARKETING_EXPERT_TOOLS.length }, '全部工具已注册');
}
