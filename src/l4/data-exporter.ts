/**
 * l4/data-exporter.ts — DataExporter (D40 GDPR Art.20 可携带权)
 *
 * 导出指定 tenantId 的全部数据（GraphStore + SessionStore + AgentMemoryStore）
 * 返回 JSON 归档包 + 清单（含 checksum）。
 *
 * 铁律 24: catch + log + degraded
 * 铁律 38: 零 as any
 * 铁律 31: 降级信号传播
 */
import { createLogger } from '@synova/logger';
import { ALL_NODE_TYPES, ALL_EDGE_TYPES } from '@synova/ontology';
import type { GraphStore } from './graph-bridge';
import type { SessionStore, SessionRow, MessageRow } from '../store/session-store';
import type { AgentMemoryStore, MemoryEntry } from './agent-memory-store';

const log = createLogger('l4/data-exporter');

// ═══ Types ═══

export interface ExportManifest {
  tenantId: string;
  exportId: string;
  exportedAt: string;
  checksum: string;
  summary: {
    nodes: number;
    edges: number;
    sessions: number;
    messages: number;
    memories: number;
  };
}

export interface ExportedNode {
  id: string;
  type: string;
  props: Record<string, unknown>;
  graph: string;
}

export interface ExportedEdge {
  id: string;
  type: string;
  from: string;
  to: string;
  weight: number;
  props: Record<string, unknown>;
  graph: string;
}

export interface ExportedSession {
  session: SessionRow;
  messages: MessageRow[];
}

export interface ExportArchive {
  tenantId: string;
  exportedAt: string;
  nodes: ExportedNode[];
  edges: ExportedEdge[];
  sessions: ExportedSession[];
  memories: MemoryEntry[];
}

function generateId(): string {
  return `exp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function simpleChecksum(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const chr = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

// ═══ DataExporter ═══

export class DataExporter {
  private graphStore: GraphStore;
  private sessionStore: SessionStore;
  private memoryStore: AgentMemoryStore;

  constructor(
    graphStore: GraphStore,
    sessionStore: SessionStore,
    memoryStore: AgentMemoryStore,
  ) {
    this.graphStore = graphStore;
    this.sessionStore = sessionStore;
    this.memoryStore = memoryStore;
  }

  /**
   * 导出指定 tenantId 的全部数据。
   * @param tenantId - 租户 ID (= orgId)
   * @returns JSON Buffer 归档 + 清单
   */
  async export(tenantId: string): Promise<{ archive: Buffer; manifest: ExportManifest }> {
    try {
      const nodes = this.exportGraphNodes(tenantId);
      const edges = this.exportGraphEdges(tenantId);
      const sessions = this.exportSessions(tenantId);
      const memories = this.exportMemories(tenantId);

      const archiveData: ExportArchive = {
        tenantId,
        exportedAt: new Date().toISOString(),
        nodes,
        edges,
        sessions,
        memories,
      };

      const json = JSON.stringify(archiveData, null, 2);
      const checksum = simpleChecksum(json);

      const manifest: ExportManifest = {
        tenantId,
        exportId: generateId(),
        exportedAt: archiveData.exportedAt,
        checksum,
        summary: {
          nodes: nodes.length,
          edges: edges.length,
          sessions: sessions.length,
          messages: sessions.reduce((sum, s) => sum + s.messages.length, 0),
          memories: memories.length,
        },
      };

      log.info({ tenantId, summary: manifest.summary }, '数据导出完成');
      return { archive: Buffer.from(json, 'utf-8'), manifest };
    } catch (err: unknown) {
      log.error({ err, tenantId }, 'DataExporter.export 异常');
      throw err;
    }
  }

  /** 导出 GraphStore 中所有节点（按类型遍历） */
  private exportGraphNodes(tenantId: string): ExportedNode[] {
    try {
      const results: ExportedNode[] = [];
      const nodeTypes: string[] = (ALL_NODE_TYPES as string[]) || [
        'activity/production', 'activity/acquisition', 'activity/innovation',
        'activity/coordination', 'activity/learning', 'activity/governance',
        'activity/maintenance', 'activity/compliance',
        'outcome/financial', 'outcome/market', 'outcome/operational', 'outcome/people',
        'outcome/innovation', 'outcome/risk', 'outcome/competitive', 'outcome/external',
        'resource/money', 'resource/person', 'resource/team', 'resource/agent',
        'resource/tool', 'resource/knowledge', 'resource/client', 'resource/brand',
        'resource/data', 'resource/ip', 'resource/location', 'resource/channel', 'resource/supplier',
      ];

      for (const type of nodeTypes) {
        try {
          const nodes = this.graphStore.queryNodes(type, {}, undefined);
          for (const n of nodes) {
            if (this.matchesTenant(n.props, tenantId)) {
              results.push({ id: n.id, type: n.type, props: n.props, graph: '' });
            }
          }
        } catch (err) {
          log.warn({ err: err instanceof Error ? err.message : String(err) }, "数据导出节点查询");
          // 类型可能无数据，跳过
        }
      }

      return results;
    } catch (err: unknown) {
      log.warn({ err, tenantId }, 'exportGraphNodes 降级');
      return [];
    }
  }

  /** 导出 GraphStore 中所有边 */
  private exportGraphEdges(_tenantId: string): ExportedEdge[] {
    try {
      const results: ExportedEdge[] = [];
      const edgeTypes: string[] = (ALL_EDGE_TYPES as string[]) || [];

      for (const type of edgeTypes) {
        try {
          const edges = this.graphStore.queryEdges(type);
          for (const e of edges) {
            results.push({
              id: e.id,
              type: e.type,
              from: e.from,
              to: e.to,
              weight: e.weight,
              props: e.props,
              graph: '',
            });
          }
        } catch (err) {
          log.warn({ err: err instanceof Error ? err.message : String(err) }, "数据导出边查询");
          // 类型可能无数据，跳过
        }
      }

      return results;
    } catch (err: unknown) {
      log.warn({ err }, 'exportGraphEdges 降级');
      return [];
    }
  }

  /** 导出 SessionStore 中该租户的全部会话 */
  private exportSessions(tenantId: string): ExportedSession[] {
    try {
      const allSessions = this.sessionStore.listSessions(1000);
      const tenantSessions = allSessions.filter((s) => s.orgId === tenantId);
      return tenantSessions.map((s) => {
        let messages: MessageRow[] = [];
        try {
          messages = this.sessionStore.getMessages(s.id);
        } catch (err) {
          log.warn({ err: err instanceof Error ? err.message : String(err) }, "导出消息获取");
          // 单会话消息读取失败，继续
        }
        return { session: s, messages };
      });
    } catch (err: unknown) {
      log.warn({ err, tenantId }, 'exportSessions 降级');
      return [];
    }
  }

  /** 导出 AgentMemoryStore 中该租户的全部记忆 */
  private exportMemories(tenantId: string): MemoryEntry[] {
    try {
      return this.memoryStore.list({ orgId: tenantId, limit: 10000 });
    } catch (err: unknown) {
      log.warn({ err, tenantId }, 'exportMemories 降级');
      return [];
    }
  }

  /** 检查 props 是否包含与 tenantId 匹配的字段 */
  private matchesTenant(props: Record<string, unknown>, tenantId: string): boolean {
    if (!props || typeof props !== 'object') return true;
    const propsObj = props as Record<string, unknown>;
    const orgVal = propsObj['orgId'];
    const tenantVal = propsObj['tenantId'];
    if (orgVal !== undefined) return String(orgVal) === tenantId;
    if (tenantVal !== undefined) return String(tenantVal) === tenantId;
    // 无租户字段 → 包含在导出中（保守策略：不漏数据）
    return true;
  }
}
