/**
 * l3/knowledge-agent.ts — KnowledgeAgent (第7个专家, M2)
 *
 * 用户的第7个专家 Agent: 检索知识库 + 引用来源 + 权限过滤。
 * 复用 ExpertDispatcher 模式, 通过 ToolRegistry 注册 4 个工具。
 *
 * 工具:
 *   search_documents — 本地 FTS5 + 权限过滤
 *   fetch_source — 获取原文片段
 *   query_graph — SOG 实时数据查询
 *   search_external — 外部知识源 (M3 接入)
 */
import { ImaClient } from "../connectors/ima";
import { createLogger } from '@synova/logger';
import { KnowledgeStore } from '../l4/knowledge-store';
import type { KnowledgeChunk } from '../l4/knowledge-store';
import { getDatabase } from '../init/engine-context';
import { SessionStore } from '../store/session-store';
import { getCurrentFilterClause } from '../services/request-context';
import type { FilterClause } from '../l4/knowledge-store';

const log = createLogger('l3/knowledge-agent');

// ═══ 工具注册 ═══

export interface KnowledgeAgentConfig {
  /** 默认返回条数 */
  defaultLimit?: number;
  /** 外部知识源 (M3 接入) */
  externalSources?: Array<{ name: string; search: (q: string, limit: number) => Promise<Array<{ title: string; snippet: string; url: string }>> }>;
  /** ima 客户端实例 (D104+D105) */
  imaClient?: ImaClient;
}

export interface KnowledgeAgent {
  /** 注册知识检索工具到 ToolRegistry */
  registerTo(registry: { register: (tool: Record<string, unknown>) => void }): void;
  /** 执行齿轮6: 从文档/消息提取知识片段 */
  runGear6(): Promise<{ extracted: number; errors: string[] }>;
  /** ima 知识提取 (D104+D105) */
  imaDataSource(enterpriseId: string, filter?: { documentTypes?: string[]; limit?: number }): Promise<import("../connectors/ima").ExtractedPkbEntry[]>;
}

export function createKnowledgeAgent(config: KnowledgeAgentConfig = {}): KnowledgeAgent {
  const defaultLimit = config.defaultLimit || 10;

  return {
    registerTo(registry) {
      // ── search_documents ──
      registry.register({
        name: 'search_documents',
        description: '搜索公司知识库 (文档/消息/诊断记录)。自动根据你的权限过滤结果。返回含来源引用的摘要。',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '搜索关键词 (支持中文)' },
            limit: { type: 'number', description: `返回条数 (默认${defaultLimit})` },
            sourceType: { type: 'string', description: '可选过滤: document/message/phase0/external' },
          },
          required: ['query'],
        },
        operationType: 'read',
        sideEffects: 'none',
        handler: async (params: Record<string, unknown>) => {
          const query = String(params.query || '');
          const limit = Number(params.limit || defaultLimit);
          const store = new KnowledgeStore(getDatabase());
          // M2: 从请求上下文获取当前用户的权限过滤条件
          const filter = await getCurrentFilterClause('KnowledgeChunk') as FilterClause;

          const { results, stats } = store.search(query, filter, limit);
          const filtered = params.sourceType
            ? results.filter(r => r.sourceType === params.sourceType)
            : results;

          return {
            results: filtered.map(r => ({
              id: r.id,
              snippet: r.snippet,
              source: formatSource(r.sourceType, r.authorityLevel),
              authorityLevel: r.authorityLevel,
              createdAt: r.createdAt,
            })),
            totalHits: stats.totalHits,
            filteredOut: stats.filteredOut,
            latencyMs: stats.latencyMs,
          };
        },
      });

      // ── query_knowledge (PKB Slice 1) ──
      registry.register({
        name: 'query_knowledge',
        description: `从全局专业知识库(PKB)检索诊断所需的行业标准、分析方法、基准数据、最佳实践。
领域: strategy(战略) / org(组织) / finance(财务) / tech(技术) / marketing(市场) / action(执行)。
类型: theory(理论框架) / benchmark(基准数据) / rule(诊断规则) / threshold(阈值) / template(模板) / case_study(案例) / regulation(法规) / best_practice(最佳实践)。
知识层级: 1=基础(中小企业主) 2=专业(manager) 3=深度(CFO/CPA)。`,
        parameters: {
          type: 'object',
          properties: {
            domain: { type: 'string', description: '专业领域 (必填): strategy/org/finance/tech/marketing/action' },
            query: { type: 'string', description: '搜索关键词 (可选, 留空返回该领域全部知识)' },
            type: { type: 'string', description: '知识类型过滤 (可选)' },
            minConfidence: { type: 'number', description: '最低置信度 0-1 (默认 0.5)' },
            knowledgeLevel: { type: 'number', description: '知识层级 1/2/3 (默认 2)' },
          },
          required: ['domain'],
        },
        operationType: 'read',
        sideEffects: 'none',
        handler: async (params: Record<string, unknown>) => {
          const store = new KnowledgeStore(getDatabase());
          const filter = await getCurrentFilterClause('KnowledgeChunk') as FilterClause;
          const { results, stats } = store.searchPKB({
            query: String(params.query || ''),
            domain: String(params.domain || ''),
            type: params.type as string | undefined,
            minConfidence: Number(params.minConfidence || 0.5),
            knowledgeLevel: Number(params.knowledgeLevel || 2),
            limit: Number(params.limit || 10),
          }, filter, Number(params.limit || 10));

          return {
            results: results.map(r => ({
              id: r.id,
              text: r.text,
              domain: (r as unknown as Record<string, unknown>).pkb_domain,
              type: (r as unknown as Record<string, unknown>).pkb_type,
              confidence: (r as unknown as Record<string, unknown>).pkb_confidence,
              level: (r as unknown as Record<string, unknown>).knowledge_level,
              source: (r as unknown as Record<string, unknown>).pkb_source || r.authorityLevel,
              sourceLabel: formatSource(r.sourceType, r.authorityLevel),
            })),
            total: stats.totalHits,
            filteredOut: stats.filteredOut,
          };
        },
      });

      // ── add_pkb_entry (团队知识沉淀) ──
      registry.register({
        name: 'add_pkb_entry',
        description: `添加一条知识到全局/团队专业知识库(PKB)。诊断过程中发现的行业规律、团队经验、最佳实践都可以沉淀下来。后续诊断会自动检索到这些知识。`,
        parameters: {
          type: 'object',
          properties: {
            domain: { type: 'string', description: '专业领域: strategy/org/finance/tech/marketing/action' },
            type: { type: 'string', description: '知识类型: theory/benchmark/rule/threshold/template/case_study/best_practice' },
            content: { type: 'string', description: '知识内容 (必填)' },
            confidence: { type: 'number', description: '置信度 0-1 (默认 0.7)' },
            level: { type: 'number', description: '知识层级 1=基础 2=专业 3=深度 (默认 2)' },
            owner: { type: 'string', description: '归属: global=全局共享, team:xxx=某团队专属 (默认 global)' },
          },
          required: ['domain', 'type', 'content'],
        },
        operationType: 'write',
        sideEffects: 'mutating',
        handler: async (params: Record<string, unknown>) => {
          const store = new KnowledgeStore(getDatabase());
          const owner = (params.owner as string) || 'global';
          const accessLevel = owner === 'global' ? 'public' : 'team';
          const accessTeamId = owner.startsWith('team:') ? owner.slice(5) : undefined;

          const id = store.insert({
            text: String(params.content || ''),
            sourceType: 'external',
            sourceId: `pkb-user:${params.domain}`,
            authorityLevel: 'reference',
            accessLevel: accessLevel as 'public' | 'team',
            accessTeamId,
            accessSensitivity: 'normal',
          });
          store.update(id, {
            pkb_domain: String(params.domain || ''),
            pkb_type: String(params.type || 'theory'),
            pkb_confidence: Number(params.confidence || 0.7),
            pkb_status: 'active',
            pkb_source: 'user_contribution',
            pkb_version: '1.0',
            knowledge_level: Number(params.level || 2),
          });

          log.info({ id, domain: params.domain, type: params.type, owner }, 'PKB 条目已添加');
          return { ok: true, id, domain: params.domain, type: params.type, owner };
        },
      });

      // ── fetch_source ──
      registry.register({
        name: 'fetch_source',
        description: '获取知识库中某条记录的完整原文 (需要权限)',
        parameters: {
          type: 'object',
          properties: {
            chunkId: { type: 'string', description: 'KnowledgeChunk ID' },
          },
          required: ['chunkId'],
        },
        operationType: 'read',
        sideEffects: 'none',
        handler: async (params: Record<string, unknown>) => {
          const chunkId = String(params.chunkId || '');
          const store = new KnowledgeStore(getDatabase());
          const filter = await getCurrentFilterClause('KnowledgeChunk') as FilterClause;
          const { results } = store.search(`id:${chunkId}`, filter, 1);
          if (results.length === 0) return { found: false, reason: '未找到或无权限' };
          const r = results[0];
          return {
            found: true,
            id: r.id,
            text: r.text.slice(0, 5000),
            source: formatSource(r.sourceType, r.authorityLevel),
            authorityLevel: r.authorityLevel,
            createdAt: r.createdAt,
          };
        },
      });

      // ── query_graph (SOG 实时数据) ──
      registry.register({
        name: 'query_graph',
        description: '查询组织本体图 (目标/指标/风险等实时数据)。直接访问 SOG 图谱。',
        parameters: {
          type: 'object',
          properties: {
            nodeType: { type: 'string', description: '节点类型: Goal/Risk/Metric/Person/Team' },
            keywords: { type: 'string', description: '关键词过滤' },
            limit: { type: 'number', description: `返回条数 (默认${defaultLimit})` },
          },
        },
        operationType: 'read',
        sideEffects: 'none',
        handler: async (params: Record<string, unknown>) => {
          try {
            // 铁律 39: L3 → L4 通过 GraphStore 接口访问，不跨层调 L1 HTTP 路由
            const { createSynovaGraphStore } = await import('@synova/graph-store');
            const db = getDatabase();
            const graphStore = createSynovaGraphStore(db);
            const orgId = String(params.orgId || 'default');
            const nodeType = params.nodeType as string | undefined;
            const { NodeType } = await import('@synova/ontology');
            // 用户输入字符串 → NodeType 枚举，不匹配则默认 RESOURCE_PERSON
            const nodeTypeValues: Record<string, string> = Object.entries(NodeType).reduce((acc, [k, v]) => { acc[k] = v as string; acc[v as string] = v as string; return acc; }, {} as Record<string, string>);
            const resolvedType: string = nodeType && nodeTypeValues[nodeType] ? nodeTypeValues[nodeType] : NodeType.RESOURCE_PERSON;
            const rawNodes = graphStore.queryNodes(resolvedType as unknown as typeof NodeType.RESOURCE_PERSON, undefined, orgId);
            let nodes = rawNodes.filter(n => !nodeType || n.type === nodeType);
            if (params.keywords) {
              const kw = String(params.keywords).toLowerCase();
              nodes = nodes.filter(n => JSON.stringify(n.props).toLowerCase().includes(kw));
            }
            const limit = Number(params.limit || defaultLimit);
            return { nodes: nodes.slice(0, limit).map(n => ({ type: n.type, props: n.props })), total: nodes.length };
          } catch (err: unknown) {
            return { error: `图查询失败: ${err instanceof Error ? err.message : String(err)}` };
          }
        },
      });

      // ── manage_permissions (M2 — 对话变更权限, admin-only) ──
      registry.register({
        name: 'manage_permissions',
        description: `管理知识库权限 (仅管理员可用)。通过对话修改知识的访问级别、团队归属、敏感度。
⚠️ 财务领域 (finance) 强制 restricted 敏感度，不可降级，不可设为 public。
市场领域 (marketing) 默认可共享 (public)。
操作类型:
- change_access: 修改单条知识的访问权限
- bulk_share: 批量将某领域的知识设为公开 (适合市场/战略知识共享)
- restrict: 批量限制某领域的知识为 team-only (适合财务/薪酬数据)
- list_by_domain: 查看某领域的权限分布概览
- grant_temporary: 临时授权某团队访问特定知识 (需设过期时间)`,
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', description: '操作: change_access / bulk_share / restrict / list_by_domain / grant_temporary' },
            targetId: { type: 'string', description: '[change_access] 目标条目 ID' },
            domain: { type: 'string', description: '[bulk_share/restrict/list_by_domain] 领域: strategy/org/finance/tech/marketing/action' },
            accessLevel: { type: 'string', description: '访问级别: public / team / private' },
            teamId: { type: 'string', description: '团队 ID (accessLevel=team 时必填)' },
            sensitivity: { type: 'string', description: '敏感度: normal / sensitive / restricted (财务领域强制 restricted)' },
            reason: { type: 'string', description: '变更原因 (会记录到审计日志)' },
          },
          required: ['action'],
        },
        operationType: 'admin',
        sideEffects: 'mutating',
        handler: async (params: Record<string, unknown>) => {
          const store = new KnowledgeStore(getDatabase());
          const user = (await import('../services/request-context')).getCurrentUser();

          // ── 权限检查: 仅 admin ──
          if (!user || !user.auth.roles.includes('admin' as never)) {
            return { ok: false, error: 'PERMISSION_DENIED', message: '仅管理员可修改知识库权限。当前角色: ' + (user?.auth.roles.join(', ') || 'unknown') };
          }

          const action = String(params.action || '');
          const reason = String(params.reason || '管理员通过对话修改');
          const changedBy = user.userId;

          try {
            switch (action) {

              case 'change_access': {
                const targetId = String(params.targetId || '');
                if (!targetId) return { ok: false, error: 'targetId 必填' };
                const rows = store.listByDomain(undefined, 1000);
                const entry = rows.find(r => r.id === targetId);
                if (!entry) return { ok: false, error: `条目 ${targetId} 不存在` };

                const result = store.updateAccess(targetId, {
                  accessLevel: params.accessLevel as KnowledgeChunk['accessLevel'] | undefined,
                  accessTeamId: (params.teamId as string) || undefined,
                  accessSensitivity: params.accessSensitivity as KnowledgeChunk['accessSensitivity'] | undefined,
                });

                if (result.ok) {
                  store.auditPermissionChange({
                    eventType: 'access_change',
                    changedBy,
                    targetIds: [targetId],
                    oldAccessLevel: entry.access_level as string,
                    newAccessLevel: (params.accessLevel as string) || (entry.access_level as string),
                    oldTeamId: entry.access_team_id as string | undefined,
                    newTeamId: (params.teamId as string) || (entry.access_team_id as string | undefined),
                    oldSensitivity: entry.access_sensitivity as string,
                    newSensitivity: (params.sensitivity as string) || (entry.access_sensitivity as string),
                    reason,
                  });
                }
                return { ...result, action: 'change_access', targetId };
              }

              case 'bulk_share': {
                const domain = String(params.domain || '');
                if (!domain) return { ok: false, error: 'domain 必填' };
                const result = store.bulkUpdateAccess({
                  domain,
                  accessLevel: (params.accessLevel as 'public' | 'team') || 'public',
                  accessSensitivity: 'normal',
                });
                if (result.updated > 0) {
                  store.auditPermissionChange({
                    eventType: 'bulk_share', changedBy,
                    targetIds: [`domain:${domain}`],
                    newAccessLevel: (params.accessLevel as string) || 'public',
                    reason,
                  });
                }
                return { ...result, action: 'bulk_share', domain };
              }

              case 'restrict': {
                const domain = String(params.domain || '');
                if (!domain) return { ok: false, error: 'domain 必填' };
                const result = store.bulkUpdateAccess({
                  domain,
                  accessLevel: 'team',
                  accessSensitivity: domain === 'finance' ? 'restricted' : 'sensitive',
                  accessTeamId: (params.teamId as string) || undefined,
                });
                if (result.updated > 0) {
                  store.auditPermissionChange({
                    eventType: 'restrict', changedBy,
                    targetIds: [`domain:${domain}`],
                    newAccessLevel: 'team',
                    newSensitivity: domain === 'finance' ? 'restricted' : 'sensitive',
                    reason,
                  });
                }
                return { ...result, action: 'restrict', domain };
              }

              case 'list_by_domain': {
                const domain = params.domain as string | undefined;
                const entries = store.listByDomain(domain, 100);
                const stats = store.getAccessStatsByDomain();
                return {
                  ok: true,
                  action: 'list_by_domain',
                  domain: domain || 'all',
                  entries: entries.map(e => ({
                    id: e.id, domain: e.pkb_domain, type: e.pkb_type,
                    accessLevel: e.access_level, teamId: e.access_team_id,
                    sensitivity: e.access_sensitivity, status: e.pkb_status,
                    preview: e.preview, updatedAt: e.updated_at,
                  })),
                  stats: domain ? { [domain]: stats[domain] } : stats,
                };
              }

              case 'grant_temporary': {
                const targetId = String(params.targetId || '');
                const teamId = String(params.teamId || '');
                if (!targetId || !teamId) return { ok: false, error: 'targetId 和 teamId 必填' };
                const result = store.updateAccess(targetId, {
                  accessLevel: 'team',
                  accessTeamId: teamId,
                });
                if (result.ok) {
                  store.auditPermissionChange({
                    eventType: 'temporary_grant', changedBy,
                    targetIds: [targetId],
                    newAccessLevel: 'team', newTeamId: teamId,
                    reason: `${reason} (临时授权至团队 ${teamId})`,
                  });
                  // 记录过期任务 (可选: 24h 后自动回收)
                  log.info({ targetId, teamId, changedBy }, '临时授权已生效 (默认 24h 后需手动回收)');
                }
                return { ...result, action: 'grant_temporary', targetId, teamId, note: '临时授权已生效，24h 后请手动回收或使用 revoke 操作' };
              }

              default:
                return { ok: false, error: `未知操作: ${action}。支持: change_access / bulk_share / restrict / list_by_domain / grant_temporary` };
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            log.error({ err: msg, action, changedBy }, '权限管理操作失败');
            return { ok: false, error: msg, action };
          }
        },
      });

      // ── search_external (M3 stub) ──
      if (config.externalSources?.length) {
        registry.register({
          name: 'search_external',
          description: '搜索外部知识源 (IMA/Confluence/语雀)。结果不存储，用完即弃。',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: '搜索关键词' },
              sourceName: { type: 'string', description: '指定知识源名称, 留空查询所有' },
            },
            required: ['query'],
          },
          operationType: 'read',
          sideEffects: 'none',
          handler: async (params: Record<string, unknown>) => {
            const query = String(params.query || '');
            const targetSource = params.sourceName as string | undefined;
            const sources = targetSource
              ? config.externalSources!.filter(s => s.name === targetSource)
              : config.externalSources!;
            const allResults: Array<{ source: string; title: string; snippet: string; url: string }> = [];
            for (const src of sources) {
              try {
                const r = await src.search(query, 5);
                allResults.push(...r.map(x => ({ source: src.name, ...x })));
              } catch { log.debug(`外部知识源 ${src.name} 查询失败`); }
            }
            return { results: allResults, total: allResults.length, note: allResults.length > 0 ? undefined : '外部知识源暂无结果' };
          },
        });
      }
    },

    /** ima 知识提取 */
    async imaDataSource(
      enterpriseId: string,
      filter?: { documentTypes?: string[]; limit?: number },
    ): Promise<import("../connectors/ima").ExtractedPkbEntry[]> {
      const client = config.imaClient;
      if (!client) { return []; }
      try {
        const docs = await client.scanDocuments({
          documentTypes: (filter?.documentTypes || ["strategy", "operations", "meetings"]) as ("strategy" | "operations" | "meetings")[],
          limit: filter?.limit || 10,
        });
        const entries: import("../connectors/ima").ExtractedPkbEntry[] = [];
        for (const doc of docs.slice(0, 5)) {
          const entry = await client.extractContent(doc.id);
          if (entry) entries.push(entry);
        }
        return entries;
      } catch (err: unknown) {
        log.warn({ err }, 'ima 扫描或提取失败 — 降级返回空');
        return [];
      }
    },

    /** 齿轮6: 从文档/消息/ima中提取知识片段到知识库 */
    async runGear6() {
      const errors: string[] = [];
      let extracted = 0;
      const store = new KnowledgeStore(getDatabase());

      try {
        // 1. 扫描 Phase 0 诊断数据 — 通过 SessionStore (L4) 接口
        const sessionStore = new SessionStore(getDatabase());
        const sessions = sessionStore.listSessionsWithState(10);
        for (const s of sessions) {
          if (!s.stateJson) continue;
          try {
            const state = JSON.parse(s.stateJson);
            const messages: Array<{ role: string; content: string }> = state.messages || [];
            const longMessages = messages.filter(m => m.content && m.content.length > 200);
            for (const msg of longMessages.slice(0, 3)) {
              store.insert({
                text: msg.content.slice(0, 2000),
                sourceType: 'phase0',
                sourceId: `session:${s.id}`,
                authorityLevel: 'reference',
                accessLevel: 'team',
                accessTeamId: s.orgId || 'default',
                accessSensitivity: 'normal',
              });
              extracted++;
            }
          } catch { log.debug('Gear6: 会话状态解析失败 — 跳过'); }
        }

        // 2. 扫描长文档 — 通过 KnowledgeStore (L4) 接口
        const chunks = store.getLongChunks(2000, 20);
        for (const c of chunks) {
          const text = c.text as string;
          if (text.length > 2000) {
            const parts = splitText(text, 2000);
            for (let i = 1; i < parts.length; i++) {
              store.insert({
                text: parts[i],
                sourceType: 'document',
                sourceId: `chunk:${c.id}:#${i}`,
                authorityLevel: 'reference',
                accessLevel: 'team',
                accessSensitivity: 'normal',
              });
              extracted++;
            }
          }
        }
      } catch (err: unknown) {
        errors.push(`Gear6 执行失败: ${err instanceof Error ? err.message : String(err)}`);
        log.warn({ err }, '齿轮6 知识提取失败');
      }

      log.info({ extracted, errors: errors.length }, '齿轮6 知识提取完成');
      return { extracted, errors };
    },
  };
}

// ═══ 辅助 ═══

function formatSource(sourceType: string, authorityLevel: string): string {
  const typeMap: Record<string, string> = {
    document: '📄 文档',
    message: '💬 消息',
    phase0: '🔍 诊断记录',
    external: '🌐 外部',
  };
  const levelMap: Record<string, string> = {
    internal_stored: '内部存储',
    external_official: '外部官方',
    external_reference: '外部参考',
    reference: '参考',
  };
  return `${typeMap[sourceType] || sourceType} · ${levelMap[authorityLevel] || authorityLevel}`;
}

/** 自动检测文本领域 (用于 Gear6 自动分类) */
function detectDomain(text: string): string | null {
  const lower = text.toLowerCase();
  if (/财务|成本|利润|收入|税务|发票|报表|现金流|资产|负债|预算/.test(lower)) return 'finance';
  if (/组织|团队|管理|文化|招聘|绩效|薪酬|劳动|合同|社保/.test(lower)) return 'org';
  if (/战略|目标|方向|竞争|市场|增长|扩张/.test(lower)) return 'strategy';
  if (/营销|客户|销售|品牌|广告|获客|转化|渠道/.test(lower)) return 'marketing';
  if (/技术|系统|工具|软件|开发|自动化|代码|架构/.test(lower)) return 'tech';
  if (/执行|项目|任务|进度|计划|交付|流程|OKR|KPI/.test(lower)) return 'action';
  if (/商业模式|盈利模式|收入模型|价值主张|画布|定价权|订阅制|平台模式|免费增值/.test(lower)) return 'business_model';
  return null;
}

function splitText(text: string, maxLen: number): string[] {
  const parts: string[] = [];
  let i = 0;
  while (i < text.length) {
    parts.push(text.slice(i, i + maxLen));
    i += maxLen;
  }
  return parts;
}
