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
          const data = await res.json() as { nodes?: Array<{ type?: string }>; edges?: unknown[]; nodeCount?: number; edgeCount?: number };
          const nodeTypes = [...new Set((data.nodes || []).map(n => n.type).filter(Boolean))];
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

  // ═══ read_document — 读取已摄取的文档内容 ═══
  registry.register({
    name: 'read_document',
    description: '读取已上传到知识库的文档内容。用于专家 Agent 查询历史诊断报告、上传的 PDF/TXT 等。',
    parameters: {
      type: 'object',
      properties: {
        orgId: { type: 'string', description: '组织 ID' },
        query: { type: 'string', description: '搜索关键词 (可选, 留空返回最近5条)' },
        limit: { type: 'number', description: '返回条数 (默认5)' },
      },
      required: ['orgId'],
    },
    operationType: 'read',
    sideEffects: 'none',
    handler: async (params) => {
      try {
        const orgId = String(params.orgId || getOrgId());
        const BASE = `http://localhost:${process.env.PORT || 3000}`;
        const res = await fetch(`${BASE}/api/ontology/graph/${orgId}`);
        if (!res.ok) return { documents: [], count: 0, hint: '本体 API 不可达' };
        const data = await res.json() as { nodes?: Array<{ type?: string; props?: Record<string, unknown> }> };
        const docs = (data.nodes || [])
          .filter(n => n.type === 'Document')
          .map(n => ({ type: n.type, name: (n.props as any)?.name || '未命名', docType: (n.props as any)?.docType }));
        const limit = Number(params.limit || 5);
        const query = String(params.query || '').toLowerCase();
        const filtered = query
          ? docs.filter(d => d.name.toLowerCase().includes(query))
          : docs.slice(-limit);
        return { documents: filtered.slice(0, limit), count: filtered.length, totalDocs: docs.length, orgId };
      } catch (err: any) {
        return { error: `读取文档失败: ${err.message}` };
      }
    },
  });

  // ═══ Cron: schedule_task (用户通过对话设定定时任务) ═══
  registry.register({
    name: 'schedule_task',
    description: '设定定时任务。支持 cron 表达式 (分 时 日 月 周) 或自然语言描述。示例: 每天19:00发送简报 → cron="0 19 * * *"',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '任务名称' },
        cron: { type: 'string', description: 'cron 表达式, 如 "0 19 * * *" (每天19:00), "*/5 * * * *" (每5分钟)' },
        action: { type: 'string', description: '任务描述: "daily_briefing"=每日简报, "connector_sync"=连接器同步, "custom"=自定义' },
      },
      required: ['name', 'cron'],
    },
    operationType: 'write',
    sideEffects: 'mutating',
    handler: async (params) => {
      try {
        const { getGlobalScheduler } = await import('../cron/scheduler');
        const { getDatabase } = await import('../init/engine-context');
        const scheduler = getGlobalScheduler(getDatabase());

        const id = scheduler.schedule(
          String(params.name),
          String(params.cron),
          async () => {
            log.info({ task: params.name }, '定时任务触发');
            // Future: trigger actual action (briefing/connector sync/custom)
          },
        );

        return { ok: true, id, name: params.name, cron: params.cron, message: `定时任务 "${params.name}" 已设定 (${params.cron})` };
      } catch (err: any) {
        return { error: `定时任务设定失败: ${err.message}` };
      }
    },
  });

  // ═══ Cron: list_scheduled_tasks ═══
  registry.register({
    name: 'list_scheduled_tasks',
    description: '查看所有已设定的定时任务，包括上次运行时间和失败次数',
    parameters: { type: 'object', properties: {} },
    operationType: 'read',
    sideEffects: 'none',
    handler: async () => {
      try {
        const { getGlobalScheduler } = await import('../cron/scheduler');
        const { getDatabase } = await import('../init/engine-context');
        const scheduler = getGlobalScheduler(getDatabase());
        const jobs = scheduler.listJobs();
        return {
          count: jobs.length,
          jobs: jobs.map(j => ({
            id: j.id, name: j.name, cron: j.cron,
            lastRunAt: j.lastRunAt, failures: j.failures, runs: j.runs,
          })),
        };
      } catch (err: any) {
        return { error: `查询定时任务失败: ${err.message}` };
      }
    },
  });

  // ═══ Skill 安装器 — 用户对话"安装 XXX"触发 ═══
  registry.register({
    name: 'install_skill',
    description: '安装一个 Skill 或 MCP Server。系统自动执行安全审计后注册。用法: install_skill(skillName="brave-search")',
    parameters: {
      type: 'object',
      properties: {
        skillName: { type: 'string', description: 'Skill 名称: brave-search / github / memory / filesystem' },
      },
      required: ['skillName'],
    },
    operationType: 'write',
    sideEffects: 'mutating',
    handler: async (params) => {
      try {
        const { getSkillInstaller } = await import('../mcp/skill-installer');
        const { getMCPBridge } = await import('../mcp/bridge');
        const skillName = String(params.skillName);
        const installer = getSkillInstaller('vendor/mcp-servers');
        const manifests = installer.discover();
        const match = manifests.find(m => m.name === skillName);
        if (!match) return { error: `未找到 Skill: ${skillName}。可用: ${manifests.map(m => m.name).join(', ') || '无'}` };

        const result = await installer.install(
          `vendor/mcp-servers/${skillName}`,
          registry,
        );
        if (result.success) {
          return { ok: true, skill: skillName, auditScore: result.auditReport.score, tools: result.installedTools };
        }
        return { error: result.error || '安装失败', auditScore: result.auditReport.score };
      } catch (err: any) {
        return { error: `安装失败: ${err.message}` };
      }
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
