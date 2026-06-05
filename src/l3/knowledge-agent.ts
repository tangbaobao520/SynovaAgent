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
import { createLogger } from '../logger';
import { KnowledgeStore } from '../l4/knowledge-store';
import { getDatabase } from '../init/engine-context';
import { getCurrentFilterClause } from '../services/request-context';
import type { FilterClause } from '../l4/knowledge-store';

const log = createLogger('l3/knowledge-agent');

// ═══ 工具注册 ═══

export interface KnowledgeAgentConfig {
  /** 默认返回条数 */
  defaultLimit?: number;
  /** 外部知识源 (M3 接入) */
  externalSources?: Array<{ name: string; search: (q: string, limit: number) => Promise<Array<{ title: string; snippet: string; url: string }>> }>;
}

export interface KnowledgeAgent {
  /** 注册知识检索工具到 ToolRegistry */
  registerTo(registry: { register: (tool: Record<string, unknown>) => void }): void;
  /** 执行齿轮6: 从文档/消息提取知识片段 */
  runGear6(): Promise<{ extracted: number; errors: string[] }>;
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
            const BASE = `http://localhost:${process.env.PORT || 3000}`;
            const orgId = String(params.orgId || 'default');
            const nodeType = params.nodeType as string | undefined;
            const res = await fetch(`${BASE}/api/ontology/graph/${orgId}`);
            if (!res.ok) return { error: '本体 API 不可达' };
            const data = await res.json() as { nodes?: Array<{ type: string; props: Record<string, unknown> }> };
            let nodes = (data.nodes || [])
              .filter(n => !nodeType || n.type === nodeType);
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

    /** 齿轮6: 从文档/消息中提取知识片段到知识库 */
    async runGear6() {
      const errors: string[] = [];
      let extracted = 0;
      const store = new KnowledgeStore(getDatabase());

      try {
        // 1. 扫描 Phase 0 诊断数据
        const db = getDatabase();
        const sessions = (db.prepare('SELECT id, org_id, state_json FROM agent_sessions WHERE state_json IS NOT NULL ORDER BY updated_at DESC LIMIT 10').all() as Array<Record<string, unknown>>) || [];
        for (const s of sessions) {
          try {
            const state = JSON.parse(s.state_json as string || '{}');
            const messages: Array<{ role: string; content: string }> = state.messages || [];
            const longMessages = messages.filter(m => m.content && m.content.length > 200);
            for (const msg of longMessages.slice(0, 3)) {
              store.insert({
                text: msg.content.slice(0, 2000),
                sourceType: 'phase0',
                sourceId: `session:${s.id}`,
                authorityLevel: 'reference',
                accessLevel: 'team',
                accessTeamId: (s.org_id as string) || 'default',
                accessSensitivity: 'normal',
              });
              extracted++;
            }
          } catch { log.debug('Gear6: 会话状态解析失败 — 跳过'); }
        }

        // 2. 扫描长文档 (knowledge_chunks 中的原始文本)
        const chunks = (db.prepare('SELECT id, text FROM knowledge_chunks WHERE LENGTH(text) > 2000 LIMIT 20').all() as Array<Record<string, unknown>>) || [];
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

function splitText(text: string, maxLen: number): string[] {
  const parts: string[] = [];
  let i = 0;
  while (i < text.length) {
    parts.push(text.slice(i, i + maxLen));
    i += maxLen;
  }
  return parts;
}
